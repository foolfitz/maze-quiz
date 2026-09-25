/** 建立 DOM 元素的小工具 */

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly Node[];
}

/**
 * 泛型 K 限定為 HTML 標籤名稱，回傳型別會跟著標籤變：
 * el('button') 的型別是 HTMLButtonElement，el('progress') 是 HTMLProgressElement。
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  element.append(...(options.children ?? []));
  return element;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' = 'secondary',
): HTMLButtonElement {
  const element = el('button', { className: `btn btn-${variant}`, text: label, attrs: { type: 'button' } });
  element.addEventListener('click', onClick);
  return element;
}

/** 依 id 取得元素並確認型別；找不到代表 index.html 和程式不一致，直接丟錯 */
export function requireElement<T extends HTMLElement>(
  id: string,
  type: new () => T,
): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`index.html 裡找不到 #${id}（${type.name}）`);
  }
  return element;
}
