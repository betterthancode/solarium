import { createProxy } from "./proxy";
import { parse } from './expression';


const splitNode = (textNode: Text, expression: string) => {
  const len = expression.length;
  // @ts-ignore
  const idx = textNode.nodeValue.indexOf(expression);
  if (idx >= 0) {
    const rest: Text = textNode.splitText(idx) as Text;
    rest.nodeValue = (rest.nodeValue as string).slice(len);
    const newNode = document.createTextNode('');
    (rest.parentElement as HTMLElement).insertBefore(newNode, rest);
    return newNode;
  }
};

const propagate = (binders: { [path: string]: Function[] }) => (
  key: string
) => {
  Object.keys(binders).forEach(path =>
    path.startsWith('this.' + key) ? binders[path].forEach(fn => fn()) : void 0
  );
};

export const scanDOMTree = (root: Element, model: any, element: HTMLElement) => {
  const binders: { [path: string]: Function[] } = {};
  const addPath = (path: string, fn: Function): void => {
    if (binders[path]) binders[path].push(fn); else binders[path] = [fn];
  };
  const update = propagate(binders);
  let proxy = createProxy(model, update)[1];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const attributes = Array.from((<Element>currentNode).attributes);
      attributes.forEach(attr => {
        if (!(<string>attr.nodeValue).startsWith('{{')) {
          return;
        }
        const { expression, paths } = parse(attr.nodeValue as string);
        if (expression) {
          if (attr.nodeName.startsWith('on')) {
            if (expression) {
              const eventName = attr.nodeName.slice(2);
              const fn = new Function(
                'event',
                'component',
                expression.slice(2, -2) + ';'
              );
              (<Element>currentNode).setAttribute(
                'on' + eventName,
                ''
              );
              (<Element>currentNode).removeAttribute(
                'on' + eventName
              );
              (currentNode as any)['on' + eventName] = (event: Event) => {
                fn.call(proxy, event, element);
              };
            }
          } else {
            // other attribute
            paths.forEach(path => {
              const fn = new Function('component', 'return ' + expression.slice(2, -2) + ';');
              addPath(path, () => {
                attr.nodeValue = String(fn.call(proxy, element));
              });
            })
          }
        }
      });
      update('');
      currentNode = walker.nextNode();
      continue;
    }
    // else -> node is Text
    if (!(currentNode.nodeValue as string).includes('{{')) {
      currentNode = walker.nextNode();
      continue;
    };
    const { expression, paths } = parse(currentNode.nodeValue as string);
    if (expression) {
      const replacementNode = splitNode(
        <Text>currentNode,
        expression
      );
      paths.forEach(path => {
        addPath(path, function() {
          const fn = new Function(
            'component',
            'return ' + expression.slice(2, -2) + ';'
          );
          try {
            (<Text>replacementNode).nodeValue = String(fn.call(proxy));
          } catch (err) {}
        });
      });
      update('');
    }
    currentNode = walker.nextNode();
  }
  return [proxy, update];
};
