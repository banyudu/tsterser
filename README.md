<h1><span style="color:red">T</span>ype<span style="color:red">S</span>ript-<span style="color:red">Terser</span></h1>

TS-Terser Fork自[terser](https://github.com/terser/terser)，从原来的Javascript实现修改为Typescript实现。

## 项目背景

Terser/Uglifyjs 是前端领域广泛使用的代码压缩工具，但其在代码量较大时，性能表现不佳。

从理论上来说，Terser/Uglifyjs在做的事情是CPU密集型任务，如果使用性能较好的语言(如C/C++、Rust)重写，应能获得不错的性能提升。

但是重写的风险与工作量较大，难以把控，我更倾向于翻译的方式。因为C/C++、Rust等均为强类型语言，先将Javascript项目转换成Typescript项目，有助于降低翻译的工作量。

同时也会产出一份Typescript的项目。

<span style="color:red">目前此项目尚处于开发阶段，请勿用于生产环境！</span>

## 项目目标

- 将代码(不包含测试用例)全部转为Typescript语言。
- 消除Any类型, 并启用严格的类型检查。为切换到强类型语言做准备。

## 当前进展

- [x] 独立发布版本
- [x] 更新文档
- [x] 将源码文件修改为TS文件
- [x] 重构项目代码结构，从原来的一类方法写在一个文件中，改为一个类的所有方法在一个文件中
- [x] 将AST相关类定义统一，梳理类定义，删除类工厂
- [x] 将AST相关的类拆分成小文件，每个文件一个类，并解决循环依赖问题
- [x] 删除 instanceOf / isAst 操作，改为实例方法实现
- [x] 添加类型信息
- [x] 启用noImplicitAny等strict校验
- [ ] 消除any类型
- [x] 添加private/public/protected信息
- [ ] 重构在Rust中无等价对应写法的写法

## 使用说明
[使用说明](./terser.md)

## 贡献指南
[贡献指南](./CONTRIBUTING.md)

PS. 关于在此项目上中的复杂批量操作，应使用脚本批量修改，在过程中沉淀相关工具方法。参见： https://github.com/rusterser/transformer/tree/master/src/scripts
