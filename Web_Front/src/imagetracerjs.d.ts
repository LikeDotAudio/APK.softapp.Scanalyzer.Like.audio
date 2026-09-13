declare module 'imagetracerjs' {
  const ImageTracer: {
    imageToSVG: (url: string, callback: (svgString: string) => void, options?: string | object) => void;
  };
  export default ImageTracer;
}
