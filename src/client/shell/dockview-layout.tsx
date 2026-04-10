import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { useEffect, useMemo, useRef } from "react";
import { CanvasPanel } from "./canvas-panel.tsx";
import { ChatPanel } from "./chat-panel.tsx";
import { ControlPanel } from "./control-panel.tsx";
import { LensTabsPanel } from "./lens-tabs-panel.tsx";
import { NodeInspectorPanel } from "./node-inspector-panel.tsx";
import { ProblemStatementPanel } from "./problem-statement-panel.tsx";
import { TimelinePanel } from "./timeline-panel.tsx";
import { workspaceStore } from "../state/workspace-store.ts";

const addDefaultPanels = (api: DockviewApi) => {
  api.addPanel({
    id: "problem-statement",
    component: "problem-statement",
    title: "Problem Statement",
  });
  api.addPanel({
    id: "canvas",
    component: "canvas",
    title: "Canvas",
    position: { referencePanel: "problem-statement", direction: "right" },
  });
  api.addPanel({
    id: "control",
    component: "control",
    title: "Control Panel",
    position: { referencePanel: "problem-statement", direction: "below" },
  });
  api.addPanel({
    id: "chat",
    component: "chat",
    title: "Chat",
    position: { referencePanel: "canvas", direction: "right" },
  });
  api.addPanel({
    id: "timeline",
    component: "timeline",
    title: "Timeline",
    position: { referencePanel: "canvas", direction: "below" },
  });
  api.addPanel({
    id: "lens-tabs",
    component: "lens-tabs",
    title: "Lens Tabs",
    position: { referencePanel: "timeline", direction: "within" },
  });
  api.addPanel({
    id: "node-inspector",
    component: "node-inspector",
    title: "Inspector",
    position: { referencePanel: "control", direction: "within" },
  });
};

export function DockviewLayout() {
  const layout = workspaceStore.useStore((state) => state.layout);
  const apiRef = useRef<DockviewApi | null>(null);
  const serverRef = useRef(workspaceStore.getSnapshot().server);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    serverRef.current = workspaceStore.getSnapshot().server;
  });

  const components = useMemo<Record<string, React.FunctionComponent<IDockviewPanelProps>>>(
    () => ({
      "problem-statement": ProblemStatementPanel,
      canvas: CanvasPanel,
      control: ControlPanel,
      chat: ChatPanel,
      timeline: TimelinePanel,
      "lens-tabs": LensTabsPanel,
      "node-inspector": NodeInspectorPanel,
    }),
    [],
  );

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    if (layout && typeof layout === "object") {
      try {
        event.api.fromJSON(layout as never);
      } catch {
        addDefaultPanels(event.api);
      }
    } else {
      addDefaultPanels(event.api);
    }

    event.api.onDidLayoutChange(() => {
      const next = event.api.toJSON();
      workspaceStore.actions.setLayoutLocal(next);
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        void serverRef.current?.setLayout(next);
      }, 250);
    });
  };

  useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  return <DockviewReact className="h-full w-full" components={components} onReady={onReady} />;
}
