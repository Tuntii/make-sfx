import { Composition } from "remotion";
import { MakeSfxDemo } from "./MakeSfxDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="MakeSfxDemo"
      component={MakeSfxDemo}
      durationInFrames={450}
      fps={30}
      width={960}
      height={540}
    />
  );
};