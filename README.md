# claude-code_nyang_mod 🐾

Claude Code를 조금 더 귀엽고 편하게 만드는 mod 모음이에요.

| mod | 하는 일 |
|---|---|
| [cute-buddy](./cute-buddy) | 입력창 위에서 친구들이 노래하고, 검은 고양이가 풀밭을 산책해요. 날씨 효과도 있어요 |
| [changed-files](./changed-files) | Claude가 수정한 파일과 마지막 diff를 옆 창에 보여줘요 |
| [nyang-nani](./nyang-nani) | 작업이 끝나면 고양이가 알려주고, 물 마시기·스트레칭을 챙겨줘요 |

## 설치

Claude Code 입력창에서 원하는 mod를 설치해요.

```
/plugin install cute-buddy --marketplace bu1basaur/claude-code_nyang_mod
/plugin install changed-files --marketplace bu1basaur/claude-code_nyang_mod
/plugin install nyang-nani --marketplace bu1basaur/claude-code_nyang_mod
```

처음 설치할 때 마켓플레이스를 추가할지 물어보면 `y`, 그다음 설치 범위를 고르면 돼요.

## cute-buddy

입력창 위 네 줄에 친구들이 나와요.

- 하나는 우쿨렐레를 치며 노래하고, 하나는 듣다가 박수를 쳐요
- 간식을 먹거나, 팔을 빙글빙글 돌리거나, 테이블에서 한잔하는 친구도 있어요
- 검은 고양이가 풀밭을 산책하다 앉고, 구르고, 낮잠 자고, 먹을 걸 상상해요
- Claude가 일하는 동안에는 다들 조금 더 신나게 움직여요
- 창이 좁으면 들어가는 만큼만 나와요

### 날씨 효과

| 날씨 | 효과 |
|---|---|
| 🌞 맑음 | 반짝이(✧)와 밝은 풀 |
| 🌙 밤 | 달과 깜빡이는 별, 어두운 풀 |
| ⛅ 흐림 | 흘러가는 구름, 흐릿한 풀 |
| ☔ 비 | 불규칙하게 떨어지는 빗방울 |
| ⛄ 눈 | 흔들리며 내리는 눈, 풀 사이에 쌓인 눈 |

### 명령어

| 명령 | 동작 |
|---|---|
| `/buddy` | 친구들 숨기기 / 다시 보이기 |
| `/buddy weather clear` | 하늘을 직접 바꾸기 (`clear` `cloudy` `rain` `snow` `night`) |
| `/buddy weather auto` | 직접 바꾼 하늘 지우기 |
| `/buddy weather on` | 실제 날씨 받아오기 켜기 |
| `/buddy weather off` | 실제 날씨 받아오기 끄기 (기본값) |

> **🔒 네트워크 안내**
> 실제 날씨 받아오기는 **기본으로 꺼져 있어요.** 꺼져 있으면 이 mod는 외부로 아무 요청도 보내지 않아요.
> `/buddy weather on`으로 켜면 20분마다 [wttr.in](https://wttr.in)에 날씨를 한 번 물어봐요. 위치는 요청한 IP로 정해지고, 코드나 대화 내용은 보내지 않아요.

## changed-files

`/changes`로 옆 창을 열고 닫아요.

- 이번 세션에서 Claude가 수정한 파일을 최근 요청부터 보여줘요
- 파일을 고르면 마지막으로 바뀐 부분(diff)을 볼 수 있어요

## nyang-nani

- 작업이 끝나면 걸린 시간과 함께 고양이가 알려줘요 (2분이 넘는 긴 작업은 더 칭찬해 줘요)
- 40분마다 물 마시기, 기지개, 먼 곳 보기 같은 알림을 띄워요
- 30분 넘게 자리를 비우면 알림을 쉬어요

## 직접 수정해서 쓰기

레포를 받은 다음, 폴더를 지정해서 Claude Code를 실행하면 설치 없이 바로 써볼 수 있어요.

```
claude --plugin-dir ./cute-buddy
```

코드를 고치면 바로 다시 불러와요. 마켓플레이스로 설치한 mod와 같이 쓰면 같은 mod가 두 번 불러와지니까 둘 중 하나만 쓰세요.
