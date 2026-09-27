/** What the micro-API said about one file. Each is the route's JSON as it
 *  came back, or null when the route was not asked, was offline or refused. */
export interface InspectionResult {
  rustOcr: any;
  rustAnalyzer: any;
  rustSvg: any;
  rustPhoto: any;
  rustDocx: any;
  rustDxf: any;
}

/** One cropped sub-area of an image, or one page broken out of a document. */
export interface MetaPhoto {
  id: string;
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
}
