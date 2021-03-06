const freeze = (object, property, value) => {
  Object.defineProperty(object, property, {
    configurable: true,
    get() { return value; },
    set(v) { console.warn(`tried to set frozen property ${property} with ${v}`) }
  });
};

const freezeWithCallback = function (object, property, callback) {
  Object.defineProperty(object, property, {
    configurable: true,
    get() { return callback(); },
    set(v) { console.warn(`tried to set frozen property ${property} with ${v}`) }
  });
}

const unfreeze = (object, property, value = null) => {
  Object.defineProperty(object, property, {
    configurable: true,
    writable: true,
    value: value
  });
};

function isFragment(node) {
  return node.getAttribute && node.getAttribute('fragment_stub') !== null;
}

function injectFragmentParentSystem(node) {
  if (node.__vf_injected === true) return;

  node.__vf_injected = true;
  node.__vf_childFragments = []; // 子のfragmentの仮ルート要素たち

  node.__vf_DOM_insertBefore = node.insertBefore;
  node.__vf_DOM_appendChild = node.appendChild;
  node.__vf_DOM_removeChild = node.removeChild;

  node.insertBefore = function (insertee, ref) {
   if(ref && ref.__vf_initialized === true) ref = ref.__vf_head;
   if(insertee.__vf_initialized === true)
     // 代わりに中身を追加する
     insertee.__vf_spreadChildren(this.__vf_DOM_insertBefore.bind(this), ref);
   else
     this.__vf_DOM_insertBefore(insertee, ref);
  }

  node.removeChild = function (removee) {
    if (removee.__vf_initialized === true) {
      const frag = removee;
      while (frag.__vf_head.nextSibling !== frag.__vf_tail)
        this.__vf_DOM_removeChild(frag.__vf_head.nextSibling);

      this.__vf_DOM_removeChild(frag.__vf_head);
      this.__vf_DOM_removeChild(frag.__vf_tail);

      unfreeze(frag, 'parentNode');
    }
    else {
      this.__vf_DOM_removeChild(removee);
    }
  }
}

function findRealParent(node) {
  if (isFragment(node))
    return findRealParent(node.parentNode);
  else return node;
}

export default {
  abstract: true,
  name: 'Fragment',

  props: {
    name: {
      type: String,
      default: () => Math.floor(Date.now() * Math.random()).toString(16)
    }
  },

  mounted() {
    const container = this.$el; // 仮に生成されたルート要素(捨てられる、子要素が格納されている)
    if (container.__vf_initialized) return; // 既に初期化されている場合、containerは既に実DOM上にいないため終了
    const directParent = container.parentNode;
    const parent = findRealParent(container); // 実際に小要素を追加するべき要素(仮のルートの親)
    injectFragmentParentSystem(parent); // 確実に親要素が改造されていることを保証

    const head = document.createComment(`fragment#${this.name}#head`)
    const tail = document.createComment(`fragment#${this.name}#tail`)
    container.__vf_parent = parent;
    container.__vf_head = head;
    container.__vf_tail = tail;
    container.__vf_children = [...container.childNodes];

    container.__vf_spreadChildren = function(insertBefore, ref) {
      insertBefore(this.__vf_head, ref);
      for(const ele of this.__vf_children)
        insertBefore(ele, ref);
      insertBefore(this.__vf_tail, ref);
    }

    container.insertBefore = function(insertee, ref)  {
      const insertIndex = this.__vf_children.indexOf(ref);
      this.__vf_children.splice(insertIndex, 0, insertee);
      this.__vf_parent.insertBefore(insertee, ref);
      freeze(insertee, 'parentNode', this);
    }

    container.appendChild = function(appendee) {
      const appendeeIndex = this.__vf_children.indexOf(appendee);
      if(appendeeIndex !== -1) this.__vf_children.splice(appendeeIndex, 1);
      this.__vf_children.push(appendee);
      this.__vf_parent.insertBefore(appendee, this.__vf_tail);
      freeze(appendee, 'parentNode', this);
    }

    container.removeChild = function(removee) {
      const removeeIndex = this.__vf_children.indexOf(removee);
      this.__vf_children.splice(removeeIndex, 1);
      this.__vf_parent.removeChild(removee);
      unfreeze(removee, 'parentNode');
    }

    // 親要素に置く
    container.__vf_spreadChildren(directParent.insertBefore.bind(directParent), container);

    // containerの実DOMは用済みなのでparentから削除する
    directParent.removeChild(container);

    // 実DOM削除によって変化してしまったプロパティをまやかしで置き換える
    freeze(container, 'parentNode', directParent);
    freezeWithCallback(container, 'nextSibling', () => tail.nextSibling);

    // 実親のシステムに登録
    //parent.__vf_registerChildFragment(container);

    container.__vf_initialized = true;

  },

  render(h) {
    const children = this.$slots.default

    // add fragment attribute on the children
    if (children && children.length)
      children.forEach(child =>
        child.data = { ...child.data, attrs: { fragment: this.name, ...(child.data || {}).attrs } }
      )
    
    return h(
      "div",
      { attrs: { fragment: this.name, fragment_stub: 'fragment_stub', } },
      children
    )
  }
};
