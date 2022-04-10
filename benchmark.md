### benchmark使用说明

#### get-oneflow benchmark 工作流程
 - get-oneflow 通过 **pytest** 的 `--collect-only`接口搜集整个指定目录下`collect-path` (在action.yml配置) 的benchmark test function
 - 在vision下实现的test函数信息，与在装饰器内配置的变量一同传入，通过docker根据配置运行pytest。
 - 每一个pytest的结果首先判断 **retry** 相关的信息，与配置比对 `iqr, stddev, iqr_outliers, stdddev` 等字段，如果超出threshold则重新运行pytest，重新启动的次数同样由 **retry** 下的 **times** 字段。如果在多次重启后依然达不到要求，则该函数运行的结果返回为 **unkown**
 - 接着该pytest的结果判断 **compare** 相关的信息， 与配置对比 `min, max, mean, median` 等字段，如果不满足要求贼该函数的结果为 **false** 否则为 **true**。
 - 所有收集的函数都执行完成之后，判断 **false** 和 **unkown** 所占的比例是否小于 `unkown_threshold` 和 `error_threshold`，如果满足条件，则该benchmark环节成功。

#### get-oneflow benchmark 更新流程
 - 在合并成功之后触发，比较所有历史结果，如果stddev满足要求，并且所有值都比best的记录小，则更新oss上的最佳历史记录。
