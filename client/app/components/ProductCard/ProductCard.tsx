import React from "react";
import AddToCart from "../AddToCart";

const ProductCard = () => {
  return (
    <div className="my-5 bg-slate-800 p-5 text-4xl text-white hover:bg-slate-950">
      <AddToCart />
    </div>
  );
};

export default ProductCard;
