declare module "react-syntax-highlighter/dist/esm/prism-light" {
    import { PrismLight } from "react-syntax-highlighter";
    export { PrismLight };
    export default PrismLight;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
    export { default as oneDark } from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
    const styles: Record<string, Record<string, React.CSSProperties>>;
    export default styles;
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
    const language: unknown;
    export default language;
}
