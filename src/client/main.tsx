import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./styles.css";

const root = createRoot(document.getElementById("app")!);

root.render(<App />);
