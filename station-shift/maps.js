/* The Maps page: tabs, and per map pan and zoom (wheel, drag, pinch, buttons, keys), a room panel on hover or tap, room search,
   layer toggles and a deck selector. Plain JavaScript, no libraries, nothing is sent anywhere. Without it the maps are still pictures
   and the rooms are in a table. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* Tabs */
  var tabs = [].slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  function selectTab(btn, focus) {
    tabs.forEach(function (t) {
      var on = t === btn;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) btn.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t, false); });
    t.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
      if (j >= 0) { e.preventDefault(); selectTab(tabs[(j + tabs.length) % tabs.length], true); }
    });
  });
  if (tabs.length) {
    var want = location.hash.indexOf('benthos') >= 0 || location.hash.indexOf('millrace') >= 0 ? 1 : 0;
    selectTab(tabs[Math.min(want, tabs.length - 1)], false);
    if (location.hash.length > 1) {
      setTimeout(function () {
        var target = document.getElementById(location.hash.slice(1));
        if (target && target.scrollIntoView) target.scrollIntoView();
      }, 0);
    }
    window.addEventListener('hashchange', function () {
      if (location.hash === '#benthos' || location.hash === '#millrace') selectTab(tabs[1], false);
      if (location.hash === '#heron') selectTab(tabs[0], false);
    });
  }

  /* Maps */
  [].forEach.call(document.querySelectorAll('.mapwrap'), initMap);

  function initMap(wrap) {
    var data = JSON.parse(wrap.querySelector('script.mapdata').textContent);
    var view = wrap.querySelector('.mapview');
    var svgs = [].slice.call(view.querySelectorAll('svg.map'));
    var title = wrap.querySelector('.roomtitle');
    var detail = wrap.querySelector('.roomdetail');
    var rooms = {};
    data.rooms.forEach(function (r) { rooms[r.i] = r; });
    var cur = 0;
    var home = svgs.map(function (s) { var v = s.viewBox.baseVal; return { x: v.x, y: v.y, w: v.width, h: v.height }; });
    var selected = null;

    function vb(i) { return svgs[i !== undefined ? i : cur].viewBox.baseVal; }
    function setVB(x, y, w, h) {
      var s = svgs[cur], h0 = home[cur];
      w = Math.max(h0.w / 14, Math.min(h0.w, w));
      h = w * h0.h / h0.w;
      x = Math.max(h0.x - w * 0.5, Math.min(h0.x + h0.w - w * 0.5, x));
      y = Math.max(h0.y - h * 0.5, Math.min(h0.y + h0.h - h * 0.5, y));
      s.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
    }
    function scaleOf() {
      var v = vb(), r = svgs[cur].getBoundingClientRect();
      return Math.max(v.width / r.width, v.height / r.height);
    }
    function toUser(cx, cy) {
      var s = svgs[cur], p = s.createSVGPoint();
      p.x = cx; p.y = cy;
      return p.matrixTransform(s.getScreenCTM().inverse());
    }
    function zoomAt(f, cx, cy) {
      var v = vb(), p = cx === undefined ? { x: v.x + v.width / 2, y: v.y + v.height / 2 } : toUser(cx, cy);
      setVB(p.x - (p.x - v.x) * f, p.y - (p.y - v.y) * f, v.width * f, v.height * f);
    }
    function reset() { var h = home[cur]; setVB(h.x, h.y, h.w, h.h); }
    function panBy(dx, dy) { var v = vb(); setVB(v.x + dx, v.y + dy, v.width, v.height); }

    /* The room panel */
    function describe(r) {
      title.textContent = r.n;
      detail.textContent = '';
      var dl = el('dl');
      function row(k, v) { dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', v)); }
      row('Kind', { hallway: 'Hallway or tube', department: 'Department', tunnel: 'Maintenance tunnel' }[r.k] || r.k);
      row('Access', r.a ? r.a + ' access' : 'Open to everyone');
      row('Who gets in', r.w);
      if (data.decks.length > 1) row('Deck', data.decks[r.d]);
      if (r.t.length) row('What is there', r.t.join(', '));
      detail.appendChild(dl);
      if (r.items.length) {
        detail.appendChild(el('p', '', 'Items at the start:'));
        var ul = el('ul', 'kit');
        r.items.forEach(function (it) {
          var li = el('li');
          var img = el('img', 'spr');
          img.src = it[2]; img.width = 24; img.height = 24; img.alt = '';
          li.appendChild(img);
          li.appendChild(document.createTextNode(' ' + it[0] + (it[1] > 1 ? ' x' + it[1] : '')));
          ul.appendChild(li);
        });
        detail.appendChild(ul);
      }
    }
    function describeDoor(text) {
      title.textContent = 'Door';
      detail.textContent = '';
      detail.appendChild(el('p', '', text));
    }
    function rest() {
      if (selected !== null && rooms[selected]) describe(rooms[selected]);
      else {
        title.textContent = data.name;
        detail.textContent = '';
        detail.appendChild(el('p', '', 'Hover over a room, or tap it, to see its name, who gets in and what is inside.'));
      }
    }
    function mark(cls, id) {
      [].forEach.call(wrap.querySelectorAll('.rm.' + cls), function (e) { e.classList.remove(cls); });
      if (id !== null) [].forEach.call(svgs[cur].querySelectorAll('.rm[data-r="' + id + '"]'), function (e) { e.classList.add(cls); });
    }
    function showDeck(d) {
      cur = d;
      svgs.forEach(function (s, i) { if (i !== d) s.setAttribute('hidden', ''); else s.removeAttribute('hidden'); });
      [].forEach.call(wrap.querySelectorAll('[data-deck]'), function (b) {
        if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(+b.getAttribute('data-deck') === d));
      });
    }
    function select(id, zoom) {
      var r = rooms[id];
      if (!r) return;
      if (r.d !== cur) showDeck(r.d);
      selected = id;
      mark('sel', id);
      describe(r);
      if (zoom) {
        var b = r.box, h0 = home[cur];
        var w = Math.max(b[2] * 2.4, h0.w / 5), h = w * h0.h / h0.w;
        setVB(b[0] + b[2] / 2 - w / 2, b[1] + b[3] / 2 - h / 2, w, h);
      }
    }
    function targetAt(x, y) {
      var t = document.elementFromPoint(x, y);
      if (!t || !t.closest) return null;
      return t.closest('.rm, .door');
    }
    function hover(t) {
      if (t && t.classList.contains('rm')) {
        var id = +t.getAttribute('data-r');
        mark('hl', id);
        if (rooms[id]) describe(rooms[id]);
      } else if (t && t.classList.contains('door')) {
        mark('hl', null);
        describeDoor(t.getAttribute('data-info'));
      } else {
        mark('hl', null);
        rest();
      }
    }

    /* Pointers: drag to pan, two fingers to pinch, a tap selects. */
    var pointers = {}, last = null, moved = 0, startAt = null;
    view.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { view.setPointerCapture(e.pointerId); } catch (x) { /* a pointer that is gone */ }
      moved = 0;
      startAt = { x: e.clientX, y: e.clientY };
      last = null;
    });
    view.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) {
        if (e.pointerType === 'mouse') hover(targetAt(e.clientX, e.clientY));
        return;
      }
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        var k = scaleOf();
        panBy(-(e.clientX - p.x) * k, -(e.clientY - p.y) * k);
        moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      } else if (ids.length === 2) {
        var o = pointers[ids[0] === String(e.pointerId) ? ids[1] : ids[0]];
        var before = Math.hypot(p.x - o.x, p.y - o.y);
        var after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if (before > 0 && after > 0) zoomAt(before / after, (e.clientX + o.x) / 2, (e.clientY + o.y) / 2);
        moved += 10;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    function up(e) {
      if (!pointers[e.pointerId]) return;
      var single = Object.keys(pointers).length === 1;
      delete pointers[e.pointerId];
      if (single && moved < 6 && startAt && e.type === 'pointerup') {
        var t = targetAt(e.clientX, e.clientY);
        if (t && t.classList.contains('rm')) select(+t.getAttribute('data-r'), false);
        else if (t && t.classList.contains('door')) { mark('hl', null); describeDoor(t.getAttribute('data-info')); }
        else { selected = null; mark('sel', null); rest(); }
      }
    }
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    view.addEventListener('mouseleave', function () { mark('hl', null); rest(); });
    view.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY);
    }, { passive: false });
    view.addEventListener('keydown', function (e) {
      var v = vb(), step = v.width * 0.1;
      var handled = true;
      if (e.key === 'ArrowLeft') panBy(-step, 0);
      else if (e.key === 'ArrowRight') panBy(step, 0);
      else if (e.key === 'ArrowUp') panBy(0, -step);
      else if (e.key === 'ArrowDown') panBy(0, step);
      else if (e.key === '+' || e.key === '=') zoomAt(1 / 1.3);
      else if (e.key === '-' || e.key === '_') zoomAt(1.3);
      else if (e.key === '0') reset();
      else handled = false;
      if (handled) e.preventDefault();
    });

    /* Buttons, decks, layers, search */
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !wrap.contains(b)) return;
      var z = b.getAttribute('data-zoom');
      if (z === 'in') zoomAt(1 / 1.4);
      else if (z === 'out') zoomAt(1.4);
      else if (z === 'reset') reset();
      else if (b.hasAttribute('data-deck')) showDeck(+b.getAttribute('data-deck'));
      else if (b.hasAttribute('data-r')) select(+b.getAttribute('data-r'), true);
    });
    [].forEach.call(wrap.querySelectorAll('input[data-layer]'), function (box) {
      function apply() {
        var layer = box.getAttribute('data-layer');
        svgs.forEach(function (s) {
          if (layer === 'door') s.classList.toggle('plain', !box.checked);
          [].forEach.call(s.querySelectorAll('.L-' + layer), function (g) { g.classList.toggle('off', !box.checked); });
        });
      }
      box.addEventListener('change', apply);
      apply();
    });
    var search = wrap.querySelector('.roomsearch');
    var items = [].slice.call(wrap.querySelectorAll('.roomlist li'));
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var first = null;
      items.forEach(function (li) {
        var b = li.firstChild, hit = !q || b.textContent.toLowerCase().indexOf(q) >= 0;
        li.hidden = !hit;
        if (hit && first === null && q) first = b;
      });
      [].forEach.call(svgs[cur].querySelectorAll('.rm.hl'), function (e) { e.classList.remove('hl'); });
      if (q) {
        data.rooms.forEach(function (r) {
          if (r.n.toLowerCase().indexOf(q) >= 0 && r.d === cur) {
            [].forEach.call(svgs[cur].querySelectorAll('.rm[data-r="' + r.i + '"]'), function (e) { e.classList.add('hl'); });
          }
        });
      }
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var hit = items.filter(function (li) { return !li.hidden; })[0];
        if (hit) { e.preventDefault(); select(+hit.firstChild.getAttribute('data-r'), true); }
      }
    });
  }
})();
