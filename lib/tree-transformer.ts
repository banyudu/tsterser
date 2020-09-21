import TreeWalker from './tree-walker'
// Tree transformer helpers.
export default class TreeTransformer extends TreeWalker {
  public before: Function
  public after?: Function
  public constructor (before: Function, after?: Function) {
    super()
    this.before = before
    this.after = after
  }
}
