// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* apk-table-shim.cjs — just enough DOM to run apk-table.js under plain node,
   no jsdom. A soft app's test copies this file next to itself and asks

     const { loadApkTable } = require('./apk-table-shim.cjs');
     const { window, document } = loadApkTable('<app>/vendor/apk-table/apk-table.js');
     window.APKTable.create(document.createElement('div'), { id: 'x', ... });
     assert.ok(window.APKTable.get('x'));

   It can also run a page's own table module in the same sandbox
   (runInShim(window, file)), so the test measures the app's code, not a copy of
   its options. Elements here know tags, classes, attributes, children and text;
   nothing renders, nothing lays out. */
'use strict';
const fs = require('fs');
const vm = require('vm');

class ClassList {
    constructor(el) { this.el = el; }
    _all() { return (this.el.className || '').split(/\s+/).filter(Boolean); }
    add(...c) { const s = new Set(this._all()); c.forEach((x) => s.add(x)); this.el.className = [...s].join(' '); }
    remove(...c) { this.el.className = this._all().filter((x) => !c.includes(x)).join(' '); }
    contains(c) { return this._all().includes(c); }
    toggle(c, on) { const has = this.contains(c); if (on === undefined ? !has : on) this.add(c); else this.remove(c); }
}

class Node {
    constructor(tag, doc) {
        this.tagName = String(tag).toUpperCase();
        this.nodeType = 1;
        this.ownerDocument = doc;
        this.childNodes = [];
        this.parentNode = null;
        this.className = '';
        this.style = {};
        this.attributes = {};
        this.dataset = {};
        this.classList = new ClassList(this);
        this._text = '';
        this._listeners = {};
    }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    appendChild(n) {
        if (n.parentNode) n.parentNode.removeChild(n);
        n.parentNode = this; this.childNodes.push(n); this._text = ''; return n;
    }
    append(...ns) { ns.forEach((n) => this.appendChild(typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n)); }
    insertBefore(n, ref) {
        if (!ref) return this.appendChild(n);
        if (n.parentNode) n.parentNode.removeChild(n);
        const i = this.childNodes.indexOf(ref);
        n.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n); return n;
    }
    replaceChild(n, old) { this.insertBefore(n, old); this.removeChild(old); return old; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.tagName === 'BODY'; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceChildren(...ns) { this.childNodes.slice().forEach((c) => this.removeChild(c)); this.append(...ns); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
    removeAttribute(k) { delete this.attributes[k]; }
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.childNodes.slice().forEach((c) => this.removeChild(c)); this._text = v == null ? '' : String(v); }
    get innerText() { return this.textContent; }
    // Markup is never parsed here: a page's own innerHTML (a chart, a card) is
    // kept as an opaque string, and APKTable itself only ever clears with it.
    set innerHTML(v) { this.textContent = ''; this._html = v == null ? '' : String(v); }
    get innerHTML() { return this._html || this.textContent; }
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
    removeEventListener(t, f) { this._listeners[t] = (this._listeners[t] || []).filter((x) => x !== f); }
    dispatchEvent(e) {
        let n = this;
        if (!e.target) e.target = this;
        while (n) { (n._listeners[e.type] || []).forEach((f) => f.call(n, e)); if (!e.bubbles) break; n = n.parentNode; }
        return true;
    }
    closest(sel) {
        const sels = sel.split(',').map((s) => s.trim());
        let n = this;
        while (n && n.nodeType === 1) { if (sels.some((s) => matches(n, s))) return n; n = n.parentNode; }
        return null;
    }
    querySelectorAll(sel) {
        const out = [];
        const walk = (n) => n.children.forEach((c) => { if (matches(c, sel)) out.push(c); walk(c); });
        walk(this);
        return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() {} blur() { if (this.onblur) this.onblur(); } click() { if (this.onclick) this.onclick({ target: this, stopPropagation() {} }); }
}

class Text {
    constructor(t) { this.nodeType = 3; this.data = String(t); this.parentNode = null; this.childNodes = []; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = String(v); }
    get children() { return []; }
}

// tag, .class, [attr] and [attr="v"], one simple selector at a time.
function matches(n, sel) {
    if (n.nodeType !== 1) return false;
    let m;
    if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel))) {
        const v = n.getAttribute(m[1]) ?? (m[1] === 'contenteditable' && n.contentEditable === 'true' ? 'true' : null);
        return m[2] === undefined ? v !== null : v === m[2];
    }
    if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return n.id === sel.slice(1);
    return n.tagName === sel.toUpperCase();
}

function makeDocument() {
    const doc = {
        createElement: (t) => new Node(t, doc),
        createTextNode: (t) => new Text(t),
        createDocumentFragment: () => new Node('#fragment', doc),
        getElementById: (id) => doc.body.querySelectorAll('#' + id)[0] || null,
        querySelectorAll: (s) => doc.body.querySelectorAll(s),
        querySelector: (s) => doc.body.querySelector(s),
        addEventListener() {},
    };
    doc.body = new Node('body', doc);
    doc.documentElement = doc.body;
    return doc;
}

/** A sandbox window with document, CustomEvent and apk-table.js loaded. */
function loadApkTable(file) {
    const document = makeDocument();
    const window = {
        document,
        console,
        setTimeout, clearTimeout,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); this.detail = init && init.detail; } },
        Blob: class Blob { constructor(parts) { this.parts = parts; } },
        URL: { createObjectURL: () => 'blob:shim', revokeObjectURL() {} },
        navigator: {},
        Map, Set, Array, Object, Number, String, JSON, Math, Date, Promise, isFinite, Error,
    };
    window.window = window;
    window.globalThis = window;
    vm.createContext(window);
    if (file) runInShim(window, file);
    return { window, document };
}

/** Run one more classic script (an app's table module) in the same sandbox. */
function runInShim(window, file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), window, { filename: file });
    return window;
}

/** Row texts of a drawn APKTable: [[cell, …], …] for the tbody. */
function rowsOf(handle) {
    const tbody = handle.el.querySelector('tbody');
    return tbody.children.map((tr) => tr.children.map((td) => td.textContent));
}

module.exports = { loadApkTable, runInShim, rowsOf, makeDocument };
