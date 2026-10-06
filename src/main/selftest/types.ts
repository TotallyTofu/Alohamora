import type { Capabilities, JobRequest } from '@shared/types';

export interface SelfTestCase {
  name: string;                                   // unique, e.g. "convert.audio.wav-mp3"
  group: string;                                  // "av", "image", "pdf", "text", "tools.video", ...
  fixtures: string[];                             // fixture names used as inputs, in order
  request: (inputs: string[]) => JobRequest;
  check?: (outputs: string[]) => Promise<void>;   // required unless expectError is set
  expectError?: RegExp;                           // the job must FAIL with a message matching this
  skip?: (caps: Capabilities) => string | false;  // return a reason to skip
}
