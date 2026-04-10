import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { useEffect, useRef } from "react";

type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
};

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!parentRef.current) {
      return;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of(defaultKeymap),
          javascript({ typescript: true }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "12px" },
            ".cm-scroller": { overflow: "auto" },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange?.(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: parentRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
    });
  }, [value]);

  return <div className="h-full min-h-0 rounded border border-neutral-700" ref={parentRef} />;
}
