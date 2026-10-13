这个设计主要是不动原始流,只包裹,只传播

以例子而言

- 块1 的id 是 媒体块1原始数据_hash 而不是整个块1 的 hash. 这样的好处, 用户得到了块1 可以 根据 媒体块2原始数据_hash 索要块二.可以形成索要链条. 当然也可以从任何 块继续要
- node_id 是随机id

块1
---
- stream_id
- node_id
- 媒体块1原始数据
- 下一个 next_node_id
- 发布者公钥
- 签名(stream_id + 媒体块1_hash + next_node_id + 发布者公钥)


块2
---
- stream_id
- node_id
- 媒体块2原始数据
- 下一个 媒体块3原始数据_hash
- 发布者公钥
- 签名(stream_id + 媒体块2_hash + next_node_id + 发布者公钥)

最后n块
- stream_id
- node_id
- 媒体块n原始数据
- 下一个 0000 // 或者一个特殊值
- 发布者公钥
- 签名(stream_id + 媒体块n_hash + (0 或者 特殊 或者不要) + 发布者公钥)

--- 或者原始块太小
块1
---
- stream_id
- 媒体块1原始数据
- 媒体块2原始数据
- 媒体块3原始数据
- 下一个 媒体块4原始数据_hash
- 发布者公钥
- 签名(stream_id + 媒体块1_hash + 媒体块2_hash + 媒体块3_hash + 媒体块4_hash + 发布者公钥)


块2
---
- stream_id
- 媒体块4原始数据
- 媒体块5原始数据
- 媒体块6原始数据
- 下一个 媒体块7原始数据_hash
- 发布者公钥
- 签名(stream_id + 媒体块4_hash + 媒体块5_hash + 媒体块6_hash + 媒体块7_hash + 发布者公钥)

最后n块
- stream_id
- 媒体块n-2原始数据
- 媒体块n-1原始数据
- 媒体块n原始数据
- 下一个 0000 // 或者一个特殊值
- 发布者公钥
- 签名(stream_id + 媒体块n-2_hash + 媒体块n-1_hash + 媒体块n_hash + 发布者公钥)