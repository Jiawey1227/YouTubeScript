## Purpose

让用户在现有插件控制页手动输入最多 20 个剧名并开始搜索，不再经过 CSV 导入。

## ADDED Requirements

### Requirement: Manual drama name entry
控制页 SHALL 提供多行文本输入，供用户按行填写剧名，并提供开始搜索的操作。系统 MUST NOT 再把 CSV 文件导入作为开始搜索的前提。

#### Scenario: User enters names on the current page
- **WHEN** 用户打开插件控制页
- **THEN** 页面提供可编辑的剧名输入区域和开始搜索操作，且不要求选择 CSV 文件

### Requirement: One name per line with a twenty-name limit
系统 SHALL 把每一非空行视为一个剧名，并在比较前去掉该行首尾空白。单次搜索 MUST NOT 接受超过 20 个有效剧名。空行 MUST 被忽略，且不计入 20 个上限。

#### Scenario: Twenty names are accepted
- **WHEN** 用户输入 20 个非空剧名并开始搜索
- **THEN** 系统接受这 20 个剧名并开始搜索

#### Scenario: Blank lines are ignored
- **WHEN** 用户输入的文本中夹有空行，且非空剧名不超过 20 个
- **THEN** 系统只搜索非空剧名，空行不产生搜索或结果

#### Scenario: More than twenty names are rejected
- **WHEN** 用户输入超过 20 个非空剧名并尝试开始搜索
- **THEN** 系统不开始搜索，并提示用户将剧名减少到 20 个以内

#### Scenario: No usable name
- **WHEN** 用户未输入任何非空剧名并尝试开始搜索
- **THEN** 系统不开始搜索，并提示需要输入剧名
