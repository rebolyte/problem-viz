import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "dockview/dist/styles/dockview.css";
import { App } from "./app.tsx";
import "./styles.css";

const root = createRoot(document.getElementById("app")!);

root.render(<App />);
