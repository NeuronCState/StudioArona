/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'theme-button': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { value?: string; size?: string },
      HTMLElement
    >;
  }
}
