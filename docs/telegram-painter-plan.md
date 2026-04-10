# Telegram Painter — Implementation Plan

## Overview

A Preact app where the user composes a "telegram" — typed text in the center with a decorative drawn border. Tools: pencil, line, rect, ellipse, emoji stamp. Supports undo/redo, color/size picking, serialization (JSON import/export), and image export (PNG).

Stack: Bun + Vite + Preact + TypeScript, use-effect-reducer, UnoCSS.

---

## 1. Project Structure

```
src/
├── app.tsx                     # Root layout — toolbar + canvas workspace
├── main.tsx                    # Vite entry (you already have this)
│
├── types/
│   └── document.ts             # DrawObject union, TelegramDocument, Tool enum
│
├── state/
│   ├── reducer.ts              # useEffectReducer reducer + effect definitions
│   ├── actions.ts              # Action type union
│   └── effects.ts              # Named effect implementations (export, import, etc.)
│
├── components/
│   ├── workspace.tsx           # Container: positions canvas + text overlay
│   ├── drawing-canvas.tsx      # <canvas> element, bindsmouse/touch, calls render
│   ├── text-overlay.tsx        # contenteditable div for telegram body
│   ├── toolbar.tsx             # Tool buttons, color picker, size slider, undo/redo
│   ├── emoji-picker.tsx        # Grid popover for emoji selection
│   └── export-bar.tsx          # Export PNG / Export JSON / Import JSON buttons
│
├── rendering/
│   ├── renderer.ts             # Pure function: render(ctx, objects, inProgress?)
│   └── emoji-cursor.ts         # emojiToCursor() helper
│
├── serialization/
│   ├── schema.ts               # Zod schema for TelegramDocument validation
│   ├── export-image.ts         # Canvas compositing + text overlay → PNG blob
│   └── export-json.ts          # Serialize / deserialize document
│
└── hooks/
    ├── use-canvas-events.ts    # mousedown/move/up → dispatch actions
    ├── use-render-loop.ts      # Watches state, calls renderer on canvas ref
    └── use-dpr-canvas.ts       # Handles devicePixelRatio sizing
```

---

## 2. Types (`types/document.ts`)

```ts
export type Point = [number, number];

export type Tool = "pencil" | "line" | "rect" | "ellipse" | "emoji" | "text";

export type DrawObject =
  | { type: "pencil"; points: Point[]; color: string; width: number }
  | { type: "line"; from: Point; to: Point; color: string; width: number }
  | { type: "rect"; origin: Point; size: Point; color: string; width: number; fill?: string }
  | { type: "ellipse"; center: Point; radii: Point; color: string; width: number; fill?: string }
  | { type: "emoji"; position: Point; emoji: string; size: number };

export interface TelegramDocument {
  version: 1;
  text: {
    html: string; // innerHTML of contenteditable
    style: {
      fontFamily: string;
      fontSize: number;
      color: string;
      lineHeight: number;
    };
  };
  canvas: {
    width: number;
    height: number;
  };
  objects: DrawObject[];
}
```

---

## 3. State Design (`state/reducer.ts`)

Use `useEffectReducer` so that side-effectful operations (file download, file read, clipboard) are declared as named effects in the reducer and executed outside of it.

### State Shape

```ts
interface AppState {
  // Document
  objects: DrawObject[];
  textHtml: string;
  textStyle: { fontFamily: string; fontSize: number; color: string; lineHeight: number };

  // Tool state
  activeTool: Tool;
  activeColor: string;
  activeWidth: number;
  activeFill: string | undefined; // for shapes — undefined = no fill
  activeEmoji: string | undefined; // selected emoji glyph
  activeEmojiSize: number;

  // In-progress drawing (not yet committed)
  inProgress: DrawObject | null;

  // Undo/redo (snapshot-based)
  undoStack: DrawObject[][];
  redoStack: DrawObject[][];

  // Canvas dimensions (logical, not physical)
  canvasWidth: number;
  canvasHeight: number;
}
```

### Actions (`state/actions.ts`)

```ts
type Action =
  // Drawing lifecycle
  | { type: "DRAW_START"; point: Point }
  | { type: "DRAW_MOVE"; point: Point }
  | { type: "DRAW_END" }
  | { type: "STAMP_EMOJI"; point: Point }

  // Tool selection
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_COLOR"; color: string }
  | { type: "SET_WIDTH"; width: number }
  | { type: "SET_FILL"; fill: string | undefined }
  | { type: "SET_EMOJI"; emoji: string }
  | { type: "SET_EMOJI_SIZE"; size: number }

  // Text
  | { type: "SET_TEXT_HTML"; html: string }
  | { type: "SET_TEXT_STYLE"; style: Partial<AppState["textStyle"]> }

  // History
  | { type: "UNDO" }
  | { type: "REDO" }

  // Serialization
  | { type: "EXPORT_JSON" }
  | { type: "IMPORT_JSON"; document: TelegramDocument }
  | { type: "EXPORT_PNG" }

  // Reset
  | { type: "CLEAR_CANVAS" };
```

### Reducer Logic — Key Cases

**DRAW_START**: Based on `activeTool`, create the appropriate `inProgress` object:

- `pencil` → `{ type: 'pencil', points: [point], color, width }`
- `line` → `{ type: 'line', from: point, to: point, color, width }`
- `rect` → `{ type: 'rect', origin: point, size: [0,0], color, width, fill }`
- `ellipse` → `{ type: 'ellipse', center: point, radii: [0,0], color, width, fill }`
- `emoji` / `text` → no-op (emoji uses STAMP_EMOJI, text uses the overlay)

**DRAW_MOVE**: Update `inProgress` based on its type:

- `pencil` → append point to points array
- `line` → update `to`
- `rect` → compute `origin` (min of start/current) and `size` (abs delta)
- `ellipse` → compute `center` (midpoint) and `radii` (half-deltas)

**DRAW_END**: Push snapshot of current `objects` onto `undoStack`, append `inProgress` to `objects`, clear `redoStack`, set `inProgress = null`.

**STAMP_EMOJI**: Same as DRAW_END but creates and commits the emoji object in one step (no drag). Pushes undo snapshot first.

**UNDO**: Pop from `undoStack`, push current `objects` to `redoStack`, restore.

**REDO**: Pop from `redoStack`, push current `objects` to `undoStack`, restore.

**EXPORT_JSON**: Return state unchanged + exec effect `'exportJson'`.

**EXPORT_PNG**: Return state unchanged + exec effect `'exportPng'`.

**IMPORT_JSON**: Replace `objects`, `textHtml`, `textStyle`, reset undo/redo stacks.

### Effects (via useEffectReducer)

```ts
// Declared in the reducer via exec():
// exec({ type: 'exportJson' })
// exec({ type: 'exportPng' })

// Implemented in effects map passed to useEffectReducer:
const effectsMap = {
  exportJson: (state, dispatch) => {
    /* build TelegramDocument, trigger download */
  },
  exportPng: (state, dispatch) => {
    /* composite canvas + text, trigger download */
  },
};
```

---

## 4. Hooks

### `use-dpr-canvas.ts`

```
Input:  canvasRef, logicalWidth, logicalHeight
Does:   On mount and resize, sets canvas.width/height to logical × devicePixelRatio,
        sets CSS width/height to logical, scales ctx by DPR.
Returns: nothing (mutates the canvas element)
```

### `use-render-loop.ts`

```
Input:  canvasRef, objects, inProgress
Does:   Runs renderer whenever objects or inProgress changes.
        Uses requestAnimationFrame to batch during active drawing.
```

Implementation: `useEffect` that calls `render(ctx, objects, inProgress)`. During active drawing (inProgress !== null), use `requestAnimationFrame` to avoid overdriving. When inProgress becomes null (draw ended), do a final synchronous render.

### `use-canvas-events.ts`

```
Input:  canvasRef, dispatch, activeTool, activeEmoji
Does:   Attaches mousedown/mousemove/mouseup (and touch equivalents) to canvas.
        Translates clientX/Y to canvas-local coords via getBoundingClientRect.
        Dispatches DRAW_START, DRAW_MOVE, DRAW_END, or STAMP_EMOJI.
Returns: nothing (attaches/detaches listeners)
```

Coordinate translation:

```ts
const rect = canvas.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;
```

Logic:

- If tool is `text`, do nothing (events go to overlay).
- If tool is `emoji`, on mousedown dispatch `STAMP_EMOJI` at point.
- Otherwise, mousedown → `DRAW_START`, mousemove (if drawing) → `DRAW_MOVE`, mouseup → `DRAW_END`.

---

## 5. Rendering (`rendering/renderer.ts`)

Pure function, no Preact dependency:

```ts
function render(
  ctx: CanvasRenderingContext2D,
  objects: DrawObject[],
  inProgress: DrawObject | null,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Optional: draw telegram "paper" background, border lines, etc.
  drawTelegramFrame(ctx, canvasWidth, canvasHeight);

  for (const obj of objects) {
    drawObject(ctx, obj);
  }

  if (inProgress) {
    drawObject(ctx, inProgress);
  }
}
```

`drawObject` switches on `obj.type` and calls the appropriate Canvas API:

- **pencil**: `beginPath`, `moveTo(points[0])`, `lineTo` for each subsequent point, `stroke`.
- **line**: `beginPath`, `moveTo(from)`, `lineTo(to)`, `stroke`.
- **rect**: `strokeRect` (and `fillRect` if `fill` is set).
- **ellipse**: `beginPath`, `ctx.ellipse(cx, cy, rx, ry, 0, 0, 2π)`, `stroke` (and `fill`).
- **emoji**: `ctx.font = '${size}px serif'`, `ctx.textAlign = 'center'`, `ctx.textBaseline = 'middle'`, `fillText(emoji, x, y)`.

### `rendering/emoji-cursor.ts`

The `emojiToCursor(emoji, size)` function from our earlier discussion. Returns a CSS cursor string. Called whenever `activeEmoji` or `activeEmojiSize` changes. Apply it to the canvas element's style.

---

## 6. Components

### `workspace.tsx`

The positioning container. Structure:

```tsx
<div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
  <DrawingCanvas /> {/* position: absolute, inset: 0, z-10 */}
  <TextOverlay /> {/* position: absolute, inset with padding, z-20 */}
</div>
```

The text overlay gets `pointer-events: none` when `activeTool !== 'text'`, and `pointer-events: auto` when it is. This is the input routing mechanism.

### `drawing-canvas.tsx`

Owns the `<canvas>` ref. Wires up `useDprCanvas`, `useRenderLoop`, `useCanvasEvents`. Sets the cursor style:

- `emoji` tool + emoji selected → `emojiToCursor(activeEmoji, activeEmojiSize)`
- `pencil` → `crosshair`
- `line` / `rect` / `ellipse` → `crosshair`
- `text` → `default` (canvas isn't interactive in text mode)

### `text-overlay.tsx`

A `contenteditable` div. Props: `html`, `style`, `isActive`, `onInput`.

- `isActive` controls `pointer-events` and visual focus hint (e.g., faint border when active).
- `onInput` dispatches `SET_TEXT_HTML` with the new innerHTML.
- Apply the text style (font, size, color, lineHeight) as inline styles.
- Add generous padding (e.g., 60-80px) to create the "border zone" where drawing happens.

Use `dangerouslySetInnerHTML` for initial load from serialized state, then let the browser manage editing. Sync back to state on `onInput`.

### `toolbar.tsx`

Horizontal bar above the workspace. Sections:

1. **Tool buttons**: pencil, line, rect, ellipse, emoji, text. Highlight active. UnoCSS: `flex gap-1`.
2. **Color picker**: `<input type="color">` bound to `activeColor`. Small swatch preview next to it.
3. **Width slider**: `<input type="range" min={1} max={12}>` bound to `activeWidth`. Show current value.
4. **Fill toggle** (for rect/ellipse): checkbox + color input for fill. Only visible when tool is rect or ellipse.
5. **Undo/Redo**: Two icon buttons. Disable when respective stack is empty.

### `emoji-picker.tsx`

Triggered when user selects the emoji tool (or clicks a dedicated emoji button in toolbar).

- Grid of ~50 curated emoji relevant to telegram decoration: ⭐ ❤️ 🌸 🕊️ ✉️ 🎖️ 🏅 🌿 💐 🔔 etc.
- Organized in a 6-8 column grid in a popover/dropdown.
- Clicking an emoji dispatches `SET_EMOJI` and closes the picker.
- Emoji size slider (or S/M/L buttons) dispatches `SET_EMOJI_SIZE`.
- Below the grid, show the currently selected emoji at current size as a preview.

### `export-bar.tsx`

Below or beside the workspace. Three buttons:

1. **Export PNG** → dispatches `EXPORT_PNG`
2. **Export JSON** → dispatches `EXPORT_JSON`
3. **Import JSON** → hidden `<input type="file" accept=".json">`, on change reads file and dispatches `IMPORT_JSON`

---

## 7. Serialization

### `serialization/schema.ts`

Zod schema for `TelegramDocument`. Validate on import so you don't load garbage into state.

```ts
const DrawObjectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pencil'), points: z.array(z.tuple([z.number(), z.number()])), color: z.string(), width: z.number() }),
  z.object({ type: z.literal('line'), from: z.tuple([z.number(), z.number()]), to: z.tuple([z.number(), z.number()]), color: z.string(), width: z.number() }),
  // ... rect, ellipse, emoji
]);

const TelegramDocumentSchema = z.object({
  version: z.literal(1),
  text: z.object({ html: z.string(), style: z.object({ ... }) }),
  canvas: z.object({ width: z.number(), height: z.number() }),
  objects: z.array(DrawObjectSchema),
});
```

### `serialization/export-json.ts`

Builds a `TelegramDocument` from current state, `JSON.stringify`s it, creates a Blob, triggers a download via a temporary `<a>` element with `URL.createObjectURL`.

### `serialization/export-image.ts`

This is the most involved piece:

1. Create an offscreen canvas at the same logical dimensions × DPR.
2. Call `render(offscreenCtx, objects)` to draw the artwork.
3. Render the text: use `ctx.fillText` with manual word wrapping within the text zone.
   - Parse the contenteditable's `innerText` (strip HTML, get plain text lines).
   - Split words, measure with `ctx.measureText`, wrap at the text zone width.
   - Draw each line with the correct font/size/color/lineHeight from textStyle.
4. `offscreenCanvas.toBlob('image/png')` → trigger download.

Note: This means the exported PNG renders text slightly differently than the live contenteditable (no bold/italic, no HTML formatting). For a v1 this is fine. If rich text formatting in export matters later, use `html2canvas` or the `foreignObject` trick.

---

## 8. Telegram Frame / Visual Design

The canvas should look like a telegram. Suggested layout at 800×600 logical pixels:

```
┌──────────────────────────────────────┐
│  ╔══════════════════════════════════╗ │
│  ║                                  ║ │  ← Double-line border
│  ║   TELEGRAM                       ║ │  ← Header text (rendered on canvas)
│  ║   ─────────────────────────      ║ │
│  ║                                  ║ │
│  ║   [contenteditable zone]         ║ │  ← Text overlay lives here
│  ║                                  ║ │
│  ║                                  ║ │
│  ║                                  ║ │
│  ╚══════════════════════════════════╝ │
│          ← drawable border area →     │  ← User draws/stamps here
└──────────────────────────────────────┘
```

The `drawTelegramFrame()` function in the renderer draws the decorative border, "TELEGRAM" header, and horizontal rule as part of the base canvas render. These are not `DrawObject`s — they're static chrome.

The border zone (between canvas edge and the inner frame) is the primary area for drawing/emoji stamps, but don't restrict drawing to that zone — let users draw anywhere.

---

## 9. Implementation Order

Build in this sequence so you have something testable at each step:

1. **Types + state skeleton**: `document.ts`, `actions.ts`, `reducer.ts` with just `SET_TOOL` and `SET_COLOR` working. Verify with a console.log in a `useEffect`.

2. **Canvas + DPR hook + renderer**: Get a canvas on screen rendering a static telegram frame. Verify it's sharp on retina.

3. **Pencil tool end-to-end**: Wire up `useCanvasEvents` → DRAW_START/MOVE/END → reducer → useRenderLoop. You should be able to draw freehand. This proves the full loop.

4. **Line, rect, ellipse tools**: Add the remaining shape tools. Each is a variation on the pencil flow in the reducer and renderer.

5. **Undo/redo**: Add snapshot logic to DRAW_END, implement UNDO/REDO actions. Wire to toolbar buttons and keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z).

6. **Text overlay**: Add contenteditable, wire pointer-events toggling, sync HTML to state.

7. **Emoji tool**: Picker component, cursor rendering, STAMP_EMOJI action.

8. **Serialization**: Zod schema, JSON export/import, PNG export with text compositing.

9. **Auto-save**: localStorage integration.

10. **Polish**: Keyboard shortcuts, tooltips, responsive sizing, telegram visual design refinements.

---

## 11. Keyboard Shortcuts

Register globally (on `window` keydown), but suppress when the contenteditable is focused:

| Shortcut       | Action                                     |
| -------------- | ------------------------------------------ |
| `P`            | Select pencil tool                         |
| `L`            | Select line tool                           |
| `R`            | Select rect tool                           |
| `E`            | Select ellipse tool                        |
| `M`            | Select emoji tool                          |
| `T`            | Select text tool                           |
| `Ctrl+Z`       | Undo                                       |
| `Ctrl+Shift+Z` | Redo                                       |
| `Ctrl+S`       | Export JSON (prevent default browser save) |
| `Ctrl+Shift+E` | Export PNG                                 |

Guard: `if (document.activeElement is the contenteditable) return` for single-letter shortcuts. Ctrl-combos are fine to handle globally.

---

## 12. Dependencies to Add

```
npm install use-effect-reducer zod
```

Everything else (Canvas API, contenteditable, File API, Blob, URL.createObjectURL) is browser-native. No emoji picker library needed if you build the simple grid.
