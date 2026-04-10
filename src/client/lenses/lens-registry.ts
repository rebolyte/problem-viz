import type { ComponentType } from "react";
import { TimelineLens } from "./timeline-lens.tsx";

export type LensProps = {};

export type LensDef = {
  id: string;
  label: string;
  Component: ComponentType<LensProps>;
};

export const LENSES: readonly LensDef[] = [
  { id: "timeline", label: "Timeline", Component: TimelineLens },
];
