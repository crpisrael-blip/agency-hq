import React from "react";
import { Composition } from "remotion";
import { DURATION, OT01LeadAt2314 } from "./OT01LeadAt2314";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const Root: React.FC = () => (
  <Composition
    id="OT01-LeadAt2314"
    component={OT01LeadAt2314}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
