/// <reference types="vite/client" />

declare module '*?worker' {
  const WorkerCtor: new (options?: WorkerOptions) => Worker;
  export default WorkerCtor;
}
