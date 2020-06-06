import { minify } from "../lib/minify";
import * as types from "./terser";

export function default_options() {
    const defs: AnyObject = {};

    Object.keys(infer_options({ 0: 0 } as any)).forEach((component) => { // TODO: check type
        const options = infer_options({
            [component]: {0: 0}
        });

        if (options) defs[component] = options;
    });
    return defs;
}

function infer_options(options: types.MinifyOptions) {
    var result = minify("", options);
    return result.error && result.error.defs;
}
