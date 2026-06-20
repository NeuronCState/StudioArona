/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      'theme-button': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { value?: string; size?: string },
        HTMLElement
      >;
    }
  }
}
