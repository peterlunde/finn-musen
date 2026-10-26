/* Kartvelger (zoom, panorering, trykk for markør) og verkvelger (trykk i ramme). */
(function () {
  'use strict';
  var h = window.Common.h;

  // Kartet (map.svg) har viewBox "170 118 555 1378".
  var MAP = { src: 'map.svg', w: 555, h: 1378, x0: 170, y0: 118 };
  // anchor: 'right' = teksten ender ved punktet, ellers sentreres den på punktet
  var LABELS = [
    { text: 'Prøverom', x: 498, y: 308, anchor: 'right' },
    { text: 'DJ-bord', x: 478, y: 584 },
    { text: 'Inngang', x: 282, y: 1484 }
  ];
  var PAD = 12;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function placePin(container, store, name, point, kind) {
    if (store[name]) { store[name].remove(); delete store[name]; }
    if (!point) return;
    var pin = h('span', { class: 'pin pin-' + kind });
    pin.style.left = (point.x * 100) + '%';
    pin.style.top = (point.y * 100) + '%';
    container.appendChild(pin);
    store[name] = pin;
  }

  /* ---------- Kart ---------- */
  function MapPicker(root, opts) {
    opts = opts || {};
    this.root = root;
    this.readOnly = !!opts.readOnly;
    this.onChange = opts.onChange || function () {};
    this.value = null;
    this.pins = {};
    this.z = 1; this.tx = 0; this.ty = 0;
    this.fitZ = 1; this.minZ = 1; this.maxZ = 4;
    this.ready = false;

    root.classList.add('map-viewport');
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', 'Kart over lokalet. Inngangen er nederst.');
    this.stage = h('div', { class: 'map-stage' });
    this.stage.style.width = MAP.w + 'px';
    this.stage.style.height = MAP.h + 'px';
    this.stage.appendChild(h('img', { src: MAP.src, alt: '', draggable: 'false' }));
    var stage = this.stage;
    LABELS.forEach(function (l) {
      var el = h('span', { class: 'map-label' + (l.anchor === 'right' ? ' right' : '') }, l.text);
      el.style.left = (((l.x - MAP.x0) / MAP.w) * 100) + '%';
      el.style.top = (((l.y - MAP.y0) / MAP.h) * 100) + '%';
      stage.appendChild(el);
    });
    root.appendChild(this.stage);

    this._bind();
    var self = this;
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(function () { self._resize(); });
      this.ro.observe(root);
    }
    this._resize();
  }

  MapPicker.prototype._resize = function () {
    var vw = this.root.clientWidth, vh = this.root.clientHeight;
    if (!vw || !vh) return;
    var fit = Math.min((vw - 2 * PAD) / MAP.w, (vh - 2 * PAD) / MAP.h);
    var wasFit = !this.ready || Math.abs(this.z - this.fitZ) < 1e-6;
    this.fitZ = fit; this.minZ = fit; this.maxZ = fit * 10;
    if (wasFit) this.z = fit;
    this.z = clamp(this.z, this.minZ, this.maxZ);
    if (wasFit) this._center();
    this.ready = true;
    this._clamp(); this._apply();
  };

  MapPicker.prototype._center = function () {
    this.tx = (this.root.clientWidth - MAP.w * this.z) / 2;
    this.ty = (this.root.clientHeight - MAP.h * this.z) / 2;
  };

  MapPicker.prototype._clamp = function () {
    var vw = this.root.clientWidth, vh = this.root.clientHeight;
    var w = MAP.w * this.z, hh = MAP.h * this.z;
    this.tx = (w <= vw - 2 * PAD + 0.5) ? (vw - w) / 2 : clamp(this.tx, vw - w - PAD, PAD);
    this.ty = (hh <= vh - 2 * PAD + 0.5) ? (vh - hh) / 2 : clamp(this.ty, vh - hh - PAD, PAD);
  };

  MapPicker.prototype._apply = function () {
    this.stage.style.transform = 'translate(' + this.tx + 'px,' + this.ty + 'px) scale(' + this.z + ')';
    this.stage.style.setProperty('--z', String(this.z));
  };

  MapPicker.prototype.zoomAt = function (factor, clientX, clientY) {
    var rect = this.root.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var nz = clamp(this.z * factor, this.minZ, this.maxZ);
    var f = nz / this.z;
    this.tx = px - (px - this.tx) * f;
    this.ty = py - (py - this.ty) * f;
    this.z = nz;
    this._clamp(); this._apply();
  };

  MapPicker.prototype.zoomBy = function (factor) {
    var rect = this.root.getBoundingClientRect();
    this.zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  MapPicker.prototype.reset = function () {
    this.z = this.fitZ; this._center(); this._clamp(); this._apply();
  };

  MapPicker.prototype.setValue = function (p, silent) {
    this.value = p || null;
    placePin(this.stage, this.pins, 'main', this.value, this.pinKind || 'answer');
    if (!silent) this.onChange(this.value);
  };

  MapPicker.prototype.setPin = function (name, p, kind) {
    placePin(this.stage, this.pins, name, p, kind);
  };

  MapPicker.prototype._tap = function (clientX, clientY) {
    var rect = this.root.getBoundingClientRect();
    var x = ((clientX - rect.left - this.tx) / this.z) / MAP.w;
    var y = ((clientY - rect.top - this.ty) / this.z) / MAP.h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    this.setValue({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
  };

  MapPicker.prototype._bind = function () {
    var self = this, r = this.root;
    var pts = new Map();
    var g = null;

    function two() { var v = Array.from(pts.values()); return [v[0], v[1]]; }

    r.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { r.setPointerCapture(e.pointerId); } catch (err) { /* ignorer */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        g = { sx: e.clientX, sy: e.clientY, tx: self.tx, ty: self.ty, moved: false, pinch: false };
      } else if (pts.size === 2) {
        var p = two(), rect = r.getBoundingClientRect();
        g = g || {};
        g.pinch = true; g.moved = true;
        g.d0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        g.z0 = self.z;
        var mx = (p[0].x + p[1].x) / 2 - rect.left, my = (p[0].y + p[1].y) / 2 - rect.top;
        g.cx = (mx - self.tx) / self.z; g.cy = (my - self.ty) / self.z;
      }
    });

    r.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && g.pinch) {
        var p = two(), rect = r.getBoundingClientRect();
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        var mx = (p[0].x + p[1].x) / 2 - rect.left, my = (p[0].y + p[1].y) / 2 - rect.top;
        var z = clamp(g.z0 * d / g.d0, self.minZ, self.maxZ);
        self.z = z; self.tx = mx - g.cx * z; self.ty = my - g.cy * z;
        self._clamp(); self._apply();
      } else if (pts.size === 1 && !g.pinch) {
        var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (!g.moved && Math.hypot(dx, dy) > 8) g.moved = true;
        if (g.moved) {
          self.tx = g.tx + dx; self.ty = g.ty + dy;
          self._clamp(); self._apply();
        }
      }
    });

    function end(e, allowTap) {
      if (!pts.has(e.pointerId)) return;
      var tap = allowTap && pts.size === 1 && g && !g.moved && !g.pinch;
      pts.delete(e.pointerId);
      if (tap && !self.readOnly) self._tap(e.clientX, e.clientY);
      if (pts.size === 0) { g = null; }
      else if (pts.size === 1) {
        var p = Array.from(pts.values())[0];
        g = { sx: p.x, sy: p.y, tx: self.tx, ty: self.ty, moved: true, pinch: false };
      }
    }
    r.addEventListener('pointerup', function (e) { end(e, true); });
    r.addEventListener('pointercancel', function (e) { end(e, false); });

    r.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
  };

  /* ---------- Verk (ramme med musemarkør) ---------- */
  function WorkPicker(root, opts) {
    opts = opts || {};
    this.root = root;
    this.readOnly = !!opts.readOnly;
    this.onChange = opts.onChange || function () {};
    this.value = null;
    this.pins = {};
    root.classList.add('work-frame');
    this.hint = h('span', { class: 'work-hint' }, opts.hint || '');
    root.appendChild(this.hint);
    var self = this;
    if (!this.readOnly) {
      root.addEventListener('click', function (e) {
        var rect = root.getBoundingClientRect();
        var x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        var y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        self.setValue({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
      });
    }
  }
  WorkPicker.prototype.setShape = function (shape) { this.root.dataset.shape = shape; };
  WorkPicker.prototype.setValue = function (p, silent) {
    this.value = p || null;
    placePin(this.root, this.pins, 'main', this.value, this.pinKind || 'answer');
    this.hint.hidden = !!this.value;
    if (!silent) this.onChange(this.value);
  };
  WorkPicker.prototype.setPin = function (name, p, kind) {
    placePin(this.root, this.pins, name, p, kind);
  };

  /* Zoomknapper som legges i en .picker-wrap ved siden av kartet */
  function zoomTools(mp) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');
    svg.appendChild(path);
    function tool(kind, label, content, fn) {
      return h('button', { type: 'button', class: 'tool', 'data-zoom': kind, 'aria-label': label, title: label, onclick: fn }, content);
    }
    return h('div', { class: 'map-tools' },
      tool('in', 'Zoom inn', '+', function () { mp.zoomBy(1.6); }),
      tool('out', 'Zoom ut', '\u2212', function () { mp.zoomBy(1 / 1.6); }),
      tool('reset', 'Vis hele kartet', svg, function () { mp.reset(); }));
  }

  window.Pickers = { MapPicker: MapPicker, WorkPicker: WorkPicker, zoomTools: zoomTools };
})();
