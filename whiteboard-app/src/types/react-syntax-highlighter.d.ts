declare module "react-syntax-highlighter/dist/esm/prism-light" {
    import { PrismLight } from "react-syntax-highlighter";
    export default PrismLight;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/one-dark" {
    const style: Record<string, React.CSSProperties>;
    export default style;
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
    const language: unknown;
    export default language;
}
