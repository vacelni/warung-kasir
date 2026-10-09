import type { Page } from './test';

// Layout audit for TEST_PLAN G.12. It runs inside the page and reports every problem it finds as a
// readable line, so a failing test names the element instead of saying "something overflows".
//
// Checked, at whatever viewport the page is in:
//  - the page scrolls horizontally;
//  - a visible element sticks out of the viewport sideways (unless it sits inside a container that
//    is meant to scroll sideways, such as a row of category tabs);
//  - text is cut off by `overflow: hidden` without an ellipsis, or a price (Rp…) is cut off at all;
//  - an interactive control is smaller than the touch minimum;
//  - an interactive control is covered by something else (a fixed bar, a sheet) when scrolled to;
//  - two interactive controls overlap (fixed and sticky bars are judged by the "covered" check);
//  - an open sheet or dialog does not fit the viewport (while one is open, only its own controls
//    are judged: the page behind it is covered on purpose).

export type LayoutOptions = {
  /** Smallest side of a tappable control in CSS px. UI_SPEC A.6: primary buttons are 48px; 44px is the floor for any control. */
  minTouch?: number;
  /** Selectors of controls exempt from the touch minimum (inline text links). */
  ignoreTouch?: string[];
};

export async function layoutProblems(page: Page, options: LayoutOptions = {}): Promise<string[]> {
  const { minTouch = 44, ignoreTouch = [] } = options;
  return page.evaluate(
    ({ minTouch, ignoreTouch }) => {
      const problems: string[] = [];
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      const describe = (el: Element) => {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        const label = el.getAttribute('aria-label');
        const id = el.id ? `#${el.id}` : '';
        return `<${el.tagName.toLowerCase()}${id}> "${label ?? text}"`;
      };

      const visible = (el: Element) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        // Visually hidden helpers (skip link, screen-reader text): 1px boxes or clipped.
        if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') return false;
        return true;
      };

      /** Inside a container that is allowed to scroll sideways. */
      const inSideScroller = (el: Element) => {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth) return true;
        }
        return false;
      };

      /** Fixed or sticky: it floats over the content by design (bottom navigation, docked cart bar). */
      const pinned = (el: Element) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const position = getComputedStyle(node).position;
          if (position === 'fixed' || position === 'sticky') return true;
        }
        return false;
      };

      // 1. Page-level horizontal scroll.
      const pageOverflow = document.documentElement.scrollWidth - vw;
      if (pageOverflow > 0) problems.push(`page scrolls sideways by ${pageOverflow}px`);

      const all = [...document.querySelectorAll('body *')].filter(visible);

      // 2. Elements sticking out of the viewport sideways.
      for (const el of all) {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue; // inner shapes follow their svg
        const rect = el.getBoundingClientRect();
        if ((rect.right > vw + 0.5 || rect.left < -0.5) && !inSideScroller(el)) {
          problems.push(`${describe(el)} sticks out sideways: left ${Math.round(rect.left)}, right ${Math.round(rect.right)} of ${vw}`);
        }
      }

      // 3. Clipped text.
      for (const el of all) {
        const style = getComputedStyle(el);
        const hasOwnText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
        if (!hasOwnText) continue;
        const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const cutOff = el.scrollWidth > el.clientWidth + 1;
        const text = el.textContent ?? '';
        if (clips && cutOff && style.textOverflow !== 'ellipsis') problems.push(`${describe(el)} is cut off (overflow hidden, no ellipsis)`);
        if (clips && cutOff && /Rp\s?\d/.test(text)) problems.push(`${describe(el)} cuts off a price`);
      }

      // 4. Touch targets.
      const modal = document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]');
      if (modal && visible(modal)) {
        const box = modal.getBoundingClientRect();
        if (box.top < -0.5 || box.bottom > vh + 0.5 || box.left < -0.5 || box.right > vw + 0.5) {
          problems.push(`${describe(modal)} (dialog) does not fit the viewport: top ${Math.round(box.top)}, bottom ${Math.round(box.bottom)} of ${vh}`);
        }
      }
      const controls = all.filter(
        (el) =>
          el.matches('button, input:not([type="hidden"]), select, textarea, [role="button"], a[href]') &&
          !el.hasAttribute('disabled') &&
          !ignoreTouch.some((selector) => el.matches(selector)) &&
          (!modal || modal.contains(el)),
      );
      for (const el of controls) {
        // A link inside a sentence is text, not a button: it is as tall as the line.
        if (el.matches('a') && getComputedStyle(el).display === 'inline') continue;
        // A small native control drawn inside a larger label is covered by the label's size.
        const box = (el.closest('label') ?? el).getBoundingClientRect();
        if (box.height < minTouch - 0.5 || box.width < minTouch - 0.5) {
          problems.push(`${describe(el)} is too small to tap: ${Math.round(box.width)}x${Math.round(box.height)}px (minimum ${minTouch})`);
        }
      }

      // 5. Overlap between controls.
      for (let i = 0; i < controls.length; i += 1) {
        for (let j = i + 1; j < controls.length; j += 1) {
          const a = controls[i]!;
          const b = controls[j]!;
          if (a.contains(b) || b.contains(a)) continue;
          // A button drawn inside a field (the show/hide password eye) shares the field's box.
          if (a.parentElement?.contains(b) && (a.matches('input, textarea, select') || b.matches('input, textarea, select'))) continue;
          if (pinned(a) !== pinned(b)) continue;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 2 && h > 2) problems.push(`${describe(a)} overlaps ${describe(b)} by ${Math.round(w)}x${Math.round(h)}px`);
        }
      }

      // 6. Controls covered by something else once scrolled into view (fixed bars, sheets).
      for (const el of controls) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) continue;
        const x = Math.min(Math.max(rect.left + rect.width / 2, 1), vw - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 1), vh - 1);
        const top = document.elementFromPoint(x, y);
        // The Next.js development overlay (nextjs-portal) is not part of the app.
        if (top && top.tagName.toLowerCase() !== 'nextjs-portal' && !el.contains(top) && !top.contains(el) && !(el.closest('label')?.contains(top) ?? false)) {
          problems.push(`${describe(el)} is covered by ${describe(top)}`);
        }
      }
      window.scrollTo(0, 0);

      return problems;
    },
    { minTouch, ignoreTouch },
  );
}
