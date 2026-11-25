## MODIFIED Requirements

### Requirement: Keep videos whose titles contain the drama name
系统 SHALL 只保留该搜索页上、去掉标点后标题文字包含完整剧名文字的普通视频。比较前系统 MUST 从标题和剧名中去掉 Unicode 标点，然后要求剧名剩余文字是标题剩余文字中的连续片段。文字比较 MUST 区分大小写，且不得做繁简转换。空白字符、表情符号和其他非标点符号 MUST 保留并参与比较。去掉标点后没有剩余文字的剧名 MUST NOT 匹配任何视频。标题中的剧名可以出现在书名号内。广告、频道和播放列表 MUST NOT 作为匹配视频返回。系统 MUST NOT 因视频时长短于或长于任何阈值而排除标题已匹配的视频。

#### Scenario: Title contains the drama name in book title marks
- **WHEN** 搜索“冰山学姐沦陷了”，搜索页出现标题为“高考后被初恋抛弃，他转身发现父母竟是全国首富！低调入学，却让高冷校花为他心动吃醋！《冰山学姐沦陷了》”的普通视频
- **THEN** 系统将该视频作为“冰山学姐沦陷了”的匹配结果返回

#### Scenario: Punctuation inside the name does not block a match
- **WHEN** 搜索“冰山学姐沦陷了”，搜索页出现标题为“冰山学姐，沦陷了”或“《冰山学姐：沦陷了》”的普通视频
- **THEN** 系统将该视频作为“冰山学姐沦陷了”的匹配结果返回

#### Scenario: Title does not contain the full name
- **WHEN** 某普通视频标题只包含剧名的一部分，或不包含该剧名
- **THEN** 系统不将该视频作为该剧名的匹配结果返回

#### Scenario: Extra characters between the name do not match
- **WHEN** 搜索“冰山学姐沦陷了”，普通视频标题为“冰山学姐没有沦陷了”
- **THEN** 系统不将该视频作为该剧名的匹配结果返回

#### Scenario: Spaces and symbols stay in the comparison
- **WHEN** 搜索“冰山学姐沦陷了”，普通视频标题为“冰山学姐 沦陷了”或“冰山学姐★沦陷了”
- **THEN** 系统不将该视频作为该剧名的匹配结果返回

#### Scenario: Traditional and simplified characters stay distinct
- **WHEN** 搜索“冰山学姐沦陷了”，普通视频标题只包含“冰山學姐淪陷了”
- **THEN** 系统不将该视频作为该剧名的匹配结果返回

#### Scenario: A name with no remaining characters matches nothing
- **WHEN** 剧名去掉标点后没有剩余文字
- **THEN** 系统不把任何视频作为该剧名的匹配结果返回

#### Scenario: Duration does not affect the match
- **WHEN** 某普通视频标题包含完整剧名，但时长不超过 60 分钟
- **THEN** 系统仍将该视频作为匹配结果返回
