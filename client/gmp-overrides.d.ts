import type { DetailedHTMLProps, HTMLAttributes, Ref } from "react";

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "gmp-place-autocomplete": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        class?: string;
        ref?: Ref<google.maps.places.PlaceAutocompleteElement | null>;
      };
    }
  }
}


