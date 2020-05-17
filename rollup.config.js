import { terser as terserPlugin } from "rollup-plugin-terser";
import typescript from "rollup-plugin-typescript2";

export default ({ configTest }) => {
    const noMinify = Boolean(configTest || process.env.CI);
    return {
        input: "main.ts",
        plugins: [
            typescript(),
            ...(noMinify ? [] : [
                terserPlugin({
                    compress: true,
                    mangle: true
                }),
            ])
        ],
        output: {
            file: "dist/bundle.min.js",
            format: "umd",
            globals: {
                "source-map": "sourceMap",
            },
            name: "Terser",
            sourcemap: true,
            esModule: false,
        },
        external: "source-map",
    };
};
