/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

'use strict'

import MOZ_SourceMap from 'source-map'
import { defaults } from './utils'
import { SourceMapOptions } from './types'

// a small wrapper around fitzgen's source-map library
export default function SourceMap (options: SourceMapOptions) {
  options = defaults(options, {
    file: null,
    root: null,
    orig: null,

    orig_line_diff: 0,
    dest_line_diff: 0
  })
  const generator: any = new MOZ_SourceMap.SourceMapGenerator({
    file: options.file,
    sourceRoot: options.root
  })
  const orig_map: any = options.orig && new MOZ_SourceMap.SourceMapConsumer(options.orig)

  if (orig_map) {
    orig_map.sources.forEach(function (source) {
      const sourceContent = orig_map.sourceContentFor(source, true)
      if (sourceContent) {
        generator.setSourceContent(source, sourceContent)
      }
    })
  }

  function add (source, gen_line: number, gen_col: number, orig_line: number, orig_col: number, name: string) {
    if (orig_map) {
      const info = orig_map.originalPositionFor({
        line: orig_line,
        column: orig_col
      })
      if (info.source === null) {
        return
      }
      source = info.source
      orig_line = info.line
      orig_col = info.column
      name = info.name || name
    }
    generator.addMapping({
      generated: { line: gen_line + options.dest_line_diff, column: gen_col },
      original: { line: orig_line + options.orig_line_diff, column: orig_col },
      source: source,
      name: name
    })
  }
  return {
    add: add,
    get: function () { return generator },
    toString: function () { return JSON.stringify(generator.toJSON()) }
  }
}
