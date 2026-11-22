/**
 * Marca "7STAY": el logo de Seven Stay (el 7) pegado a "STAY" en Anton.
 * El logo se pinta como máscara para tomar el color del texto (`currentColor`).
 */
const MASCARA_LOGO = {
  maskImage: 'url(/seven-stay-logo.png)',
  WebkitMaskImage: 'url(/seven-stay-logo.png)',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
  // El 7 es un fondo de color recortado: sin esto, al imprimir (placas QR) el
  // navegador omite los fondos y el logo desaparece.
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
} as const;

const TAMANOS = {
  sm: { logo: 'h-[14px] w-[15px]', texto: 'text-[15px]' },
  md: { logo: 'h-[20px] w-[22px]', texto: 'text-[21px]' },
  lg: { logo: 'h-[32px] w-[35px]', texto: 'text-[34px]' },
} as const;

export default function MarcaSevenStay({ tamano = 'md', className = '' }: { tamano?: keyof typeof TAMANOS; className?: string }) {
  const t = TAMANOS[tamano];
  return (
    <span aria-label="Seven Stay" role="img" className={`inline-flex items-end ${className}`}>
      <span aria-hidden style={MASCARA_LOGO} className={`mb-[0.06em] inline-block bg-current ${t.logo}`} />
      <span
        aria-hidden
        style={{ fontFamily: 'var(--font-anton), Impact, sans-serif' }}
        className={`uppercase leading-none tracking-[0.03em] ${t.texto}`}
      >
        STAY
      </span>
    </span>
  );
}
