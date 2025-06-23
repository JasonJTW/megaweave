import React from "react";
import AddToCart from "../AddToCart";

const ProductCard = () => {
  return (
    <div className="p-5 my-5 bg-slate-800 text-white text-4xl hover:bg-slate-950">
      <AddToCart />
    </div>
  );
};

export default ProductCard;
