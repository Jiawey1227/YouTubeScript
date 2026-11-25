## Purpose

按用户输入的剧名搜索 YouTube，保留标题包含完整剧名的视频，并返回搜索卡片上直接显示的播放量、相对时间和视频链接。

## ADDED Requirements

### Requirement: Search by the full drama name
对于每个有效剧名，系统 SHALL 查询 `https://www.youtube.com/results?search_query=` 加上该剧名经 URL 编码后的文本。系统 MUST 使用完整剧名，不得改写、翻译或补上别名。

#### Scenario: Encoded search for a Chinese title
- **WHEN** 用户搜索“冰山学姐沦陷了”
- **THEN** 系统查询 `https://www.youtube.com/results?search_query=%E5%86%B0%E5%B1%B1%E5%AD%A6%E5%A7%90%E6%B2%A6%E9%99%B7%E4%BA%86`

### Requirement: Keep videos whose titles contain the drama name
系统 SHALL 只保留该搜索页上、标题包含完整剧名连续文本的普通视频。标题中的剧名可以出现在书名号内。比较 MUST 区分大小写，且不得做繁简转换。广告、频道和播放列表 MUST NOT 作为匹配视频返回。系统 MUST NOT 因视频时长短于或长于任何阈值而排除标题已匹配的视频。

#### Scenario: Title contains the drama name in book title marks
- **WHEN** 搜索“冰山学姐沦陷了”，搜索页出现标题为“高考后被初恋抛弃，他转身发现父母竟是全国首富！低调入学，却让高冷校花为他心动吃醋！《冰山学姐沦陷了》”的普通视频
- **THEN** 系统将该视频作为“冰山学姐沦陷了”的匹配结果返回

#### Scenario: Title does not contain the full name
- **WHEN** 某普通视频标题只包含剧名的一部分，或不包含该剧名
- **THEN** 系统不将该视频作为该剧名的匹配结果返回

#### Scenario: Duration does not affect the match
- **WHEN** 某普通视频标题包含完整剧名，但时长不超过 60 分钟
- **THEN** 系统仍将该视频作为匹配结果返回

### Requirement: Read displayed search-card fields
对于每条匹配视频，系统 SHALL 返回所属剧名、搜索卡片上的视频标题、卡片直接显示的播放量文本、卡片直接显示的相对时间文本，以及指向该视频的链接。播放量与相对时间 MUST 保持页面上的显示文本，例如“6659次播放”和“22小时前”。系统 MUST NOT 打开视频详情页来替换这些文本，也 MUST NOT 把相对时间换算成绝对日期，或把简写播放量换算成精确整数。

#### Scenario: Matching card shows views and relative time
- **WHEN** 匹配视频的搜索卡片显示“6659次播放”和“22小时前”
- **THEN** 结果中的播放量为“6659次播放”，相对时间为“22小时前”，并包含该视频标题和视频链接

#### Scenario: A displayed field is absent
- **WHEN** 匹配视频的标题包含完整剧名，但搜索卡片缺少播放量或相对时间
- **THEN** 系统仍返回该视频，并把缺失字段标为不可用

### Requirement: Return every match from the initial results
系统 SHALL 返回搜索页初次呈现的全部匹配普通视频，并保持它们在页面上的出现顺序。系统 MUST NOT 只保留第一条匹配。系统 MUST NOT 翻到后续结果页，也 MUST NOT 为寻找更多匹配而无限滚动。某个剧名没有匹配时，系统 SHALL 保留该剧名并标明没有匹配，且 MUST NOT 将其表述为全站不存在相关视频。

#### Scenario: Several videos match one name
- **WHEN** 同一剧名在初次呈现的搜索结果中有多条标题包含完整剧名的普通视频
- **THEN** 系统按页面顺序返回全部这些视频

#### Scenario: No video on the page matches
- **WHEN** 某剧名的初次搜索结果中没有标题包含完整剧名的普通视频
- **THEN** 结果中保留该剧名，并标明这次搜索没有匹配

### Requirement: One failed search does not discard other names
系统 SHALL 逐个搜索已接受的剧名。某一个剧名的搜索页无法读取时，系统 MUST 将该剧名标为失败并说明原因，同时保留其他剧名已经得到的结果。

#### Scenario: A later name fails
- **WHEN** 前一个剧名已经得到匹配结果，后一个剧名的搜索页无法读取
- **THEN** 前一个剧名的结果仍然可见，后一个剧名显示为失败
