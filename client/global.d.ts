import React from "react";

declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare global {
  interface Window {
    google: typeof google;
  }

  namespace google.maps.places {
    interface PlaceAutocompleteElement extends HTMLElement {
      name: string;
      value: string;
      getPlace(): google.maps.places.PlaceResult;
      addEventListener(
        type: "gmp-placeselect",
        listener: (event: PlaceResultEvent) => void
      ): void;
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ): void;
      removeEventListener(
        type: "gmp-placeselect",
        listener: (event: PlaceResultEvent) => void
      ): void;
      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
      ): void;
    }
    interface PlaceResultEvent extends Event {
      place: google.maps.places.PlaceResult;
    }
  }


}
