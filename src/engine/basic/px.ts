/** The cell size of the layer the basic engine is evaluating (the shader's PX), for CPU twins that work per cell. */
let px = 0.02;
export const setCurrentPX = (v: number) => { px = v; };
export const currentPX = () => px;
