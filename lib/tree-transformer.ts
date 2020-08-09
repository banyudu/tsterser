import TreeWalker from './tree-walker'
// Tree transformer helpers.
export default class TreeTransformer extends TreeWalker {
  before: any
  after: any
  constructor (before: any, after?: any) {
    super()
    this.before = before
    this.after = after
  }
}
