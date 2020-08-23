import { RawSourceMap } from 'source-map'

export interface Comment {
  value: string
  type: 'comment1' | 'comment2' | 'comment3' | 'comment4' | 'comment5'
  pos: number
  line: number
  col: number
  nlb?: boolean
}

export interface SourceMapOptions {
  /** Source map object, 'inline' or source map file content */
  content?: RawSourceMap | string
  includeSources?: boolean
  filename?: string
  root?: string
  url?: string | 'inline'
  asObject?: any
  file?: string
  orig?: RawSourceMap
  orig_line_diff?: number
  dest_line_diff?: number
}
