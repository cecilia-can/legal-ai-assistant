type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; url?: string };

/** Link only plain-text citation markers that have a recorded source. */
export function citationRemarkPlugin(numbers: ReadonlySet<number>) {
  return function transform(tree: MarkdownNode) {
    const walk = (parent: MarkdownNode) => {
      if (!parent.children) return;
      for (let index = 0; index < parent.children.length; index += 1) {
        const child = parent.children[index];
        if (child.type !== "text" || parent.type === "link" || parent.type === "linkReference") {
          if (child.type !== "link" && child.type !== "linkReference") walk(child);
          continue;
        }
        const value = child.value ?? "";
        const pieces: MarkdownNode[] = [];
        const pattern = /\[来源([1-9]\d?)\]/g;
        let offset = 0;
        for (const match of value.matchAll(pattern)) {
          const number = Number(match[1]);
          if (!numbers.has(number)) continue;
          const start = match.index ?? 0;
          if (start > offset) pieces.push({ type: "text", value: value.slice(offset, start) });
          pieces.push({ type: "link", url: `#rag-source-${number}`, children: [{ type: "text", value: match[0] }] });
          offset = start + match[0].length;
        }
        if (!pieces.length) continue;
        if (offset < value.length) pieces.push({ type: "text", value: value.slice(offset) });
        parent.children.splice(index, 1, ...pieces);
        index += pieces.length - 1;
      }
    };
    walk(tree);
  };
}
