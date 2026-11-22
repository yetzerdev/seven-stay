/* eslint-disable @next/next/no-img-element -- el logo viene de la URL que guarda cada hotel; next/image exigiría dominios fijos */

/** Logo del hotel (PNG transparente). Si el hotel aún no cargó un logo, no ocupa espacio. */
export default function LogoHotel({ src, className }: { src: string; className: string }) {
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}
