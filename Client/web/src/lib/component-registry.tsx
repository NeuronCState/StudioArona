import type { ComponentType } from "react";

type ComponentRegistry = Map<string, ComponentType<Record<string, unknown>>>;

export const registry: ComponentRegistry = new Map();

export function registerComponent(
  name: string,
  Component: ComponentType<Record<string, unknown>>,
) {
  registry.set(name, Component);
}

export function getComponent(
  name: string,
): ComponentType<Record<string, unknown>> | undefined {
  return registry.get(name);
}

export function DynamicRender({
  name,
  props,
}: {
  name: string;
  props: Record<string, unknown>;
}) {
  const Comp = registry.get(name);
  if (!Comp) {
    return (
      <div className="rounded-lg border border-[var(--color-warn)] bg-[var(--color-warn)]/5 p-3 text-xs text-[var(--color-warn)]">
        Unknown component: <code className="font-mono">{name}</code>
      </div>
    );
  }
  return <Comp {...props} />;
}
