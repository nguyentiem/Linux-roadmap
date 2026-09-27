# Bài 18 — Thuật toán lập lịch CPU

[Mục lục](../README.md) · [← Bài 17](17-quan-ly-bo-nho.md) · [Bài 19 →](19-scheduler-linux.md)

## Mục tiêu: vì sao chương trình phải chờ dù máy vẫn đang chạy?

Giả sử bạn vừa biên dịch một dự án, vừa gõ trong trình soạn thảo, vừa chạy chương trình thu thập cảm biến. Cả ba đều cần **CPU**, bộ xử lý thực hiện các lệnh tính toán. Nếu tại một thời điểm chỉ có một CPU có thể phục vụ chúng, ai được chạy trước? Chờ bao lâu mới hợp lý? Một cách chọn có thể làm công việc kết thúc sớm nhưng khiến người gõ bàn phím đợi lâu.

Sau bài này, bạn cần tự vẽ lịch chạy; tính thời gian chờ, phản hồi và hoàn thành; giải thích ưu điểm có điều kiện của FCFS, SJF, SRTF, Round Robin, Priority và MLFQ. Cần nền tảng bài 12 nhưng các khái niệm dùng ở đây được nhắc lại. Bài 19 sẽ nối mô hình này với Linux thực tế.

**Phạm vi:** trừ nơi ghi khác, ta mô phỏng một CPU, mỗi công việc có một đoạn tính toán, biết trước độ dài, không chờ thiết bị và bỏ qua chi phí đổi công việc. Các số là đơn vị thời gian giả định, không phải phép đo trên máy hay lời hứa của Linux.

## 1. Thực ra hệ điều hành chọn cái gì để chạy?

**Chương trình** là tập lệnh lưu trên máy, như tệp thực thi của Python. **Process — tiến trình** là một lần chương trình đang hoạt động, có trạng thái và tài nguyên riêng; hai lần mở cùng chương trình có thể tạo hai tiến trình. Trong một tiến trình có thể có nhiều **thread — luồng thực thi**, mỗi luồng có vị trí đang chạy riêng nhưng chia sẻ nhiều tài nguyên với các luồng cùng tiến trình. Ví dụ, một luồng đọc cảm biến còn luồng khác ghi kết quả. Trên Linux có thể xem tiến trình bằng `ps` và xem các luồng bằng `ps -L -p PID`, với `PID` là số nhận diện tiến trình.

**Kernel — nhân hệ điều hành** là phần lõi quản lý CPU, bộ nhớ và thiết bị. **Scheduler — bộ lập lịch** là bộ phận của nhân quyết định luồng nào được chạy tiếp. Trong bài lý thuyết, ta dùng **task — công việc cần lập lịch** để gọi P1, P2, P3; đó là các đối tượng mô hình, không nhất thiết mỗi đối tượng phải là một tiến trình Linux. Linux thực tế lập lịch từng luồng. [Giao diện lập lịch Linux](https://man7.org/linux/man-pages/man7/sched.7.html).

Một công việc chỉ tham gia tranh CPU khi **runnable — sẵn sàng chạy**: mọi điều kiện để thực hiện lệnh đã có, chỉ còn cần được cấp CPU. **Running — đang chạy** nghĩa là nó thực sự đang được CPU phục vụ. **Blocked — bị chặn để chờ** nghĩa là nó chưa thể tiếp tục, chẳng hạn đang đợi dữ liệu từ thiết bị. **I/O — nhập/xuất** là trao đổi dữ liệu với thiết bị hoặc nơi bên ngoài việc tính toán, như đọc ổ đĩa; lúc chờ I/O, một task có thể không cần CPU.

```text
Tạo công việc → Sẵn sàng → Đang chạy → Hoàn thành
                  ↑           |
                  +─ bị lấy CPU┤
                  |           | cần dữ liệu chưa có
                  |           v
                  +─ có dữ liệu ─ Chờ thiết bị
```

Đọc sơ đồ từ trái sang phải: một task được tạo rồi đợi CPU. Khi được chọn, nó chạy; nếu còn việc nhưng mất lượt thì quay về trạng thái sẵn sàng. Nếu cần dữ liệu chưa có, nó chờ thiết bị; sau khi có dữ liệu mới quay lại tranh CPU. Mũi tên không có nghĩa tất cả task đều đi qua mọi trạng thái.

**Run queue — hàng đợi công việc sẵn sàng** là tập task đang chờ hoặc có thể được chọn chạy. “Hàng đợi” không bắt buộc được triển khai như danh sách xếp hàng đơn giản; thuật toán có thể chọn người ngắn nhất, ưu tiên cao nhất hoặc người đến trước. Task chờ thiết bị không được chọn chỉ vì đứng đầu một danh sách.

## 2. Ta muốn tối ưu điều gì, và đo bằng cách nào?

Dùng tình huống xuyên suốt: P1 là công việc tính toán dài, P2 là công việc vừa, P3 là công việc ngắn. **Arrival — thời điểm đến**, ký hiệu A, là lúc công việc được đưa vào hệ để chờ chạy. **CPU burst — đoạn cần CPU**, ký hiệu B, là lượng thời gian tính toán liên tục cần trong mô hình. Nó không phải toàn bộ thời gian tính từ lúc bạn bấm chạy đến khi chương trình kết thúc.

**First start — lần bắt đầu chạy đầu tiên**, ký hiệu S, và **completion — thời điểm hoàn tất**, ký hiệu C, được đọc từ lịch chạy. Với một task đến ở 2, chạy lần đầu ở 4 và xong ở 11, ta có A=2, S=4, C=11. Đọc ba mốc trước khi áp dụng công thức:

| Đại lượng | Ý nghĩa trong bài | Công thức và ví dụ |
|---|---|---|
| Turnaround, thời gian từ đến đến xong | Công việc tồn tại trong hệ bao lâu | C−A = 11−2 = 9 |
| Response, thời gian chờ lần chạy đầu | Bao lâu mới được phục vụ lần đầu | S−A = 4−2 = 2 |
| Waiting, tổng thời gian sẵn sàng nhưng chưa chạy | Tổng mọi lần chờ CPU, kể cả sau khi đã chạy | C−A−B; nếu B=5 thì bằng 4 |

Bảng giúp tách “được chạy sớm” với “xong sớm”. Trong ví dụ, response chỉ là 2 nhưng waiting là 4: task còn đợi thêm 2 sau lần bắt đầu đầu tiên. Response ở đây **không** phải thời gian ứng dụng trả kết quả đến người dùng; ứng dụng còn có thể tính toán hoặc gửi mạng sau khi lần đầu nhận CPU.

Nếu có thời gian chờ I/O là I, và mọi thời gian được phân loại đủ, waiting = C−A−tổng thời gian CPU−I. Ví dụ, vòng đời 12 đơn vị gồm 4 tính toán, 5 chờ thiết bị thì còn 3 chờ CPU; lấy 12−4 sẽ nhầm cả chờ thiết bị thành chờ CPU. Trong hệ thật có thêm dừng tiến trình và những trạng thái khác nên không áp công thức giản lược thiếu dữ liệu.

Các mục tiêu khác cũng cần tên rõ:

- **Throughput — thông lượng**: số công việc xong trên một đơn vị thời gian. Hoàn tất 3 task trong 14 đơn vị cho 3/14 task mỗi đơn vị trong khoảng đo này.
- **CPU utilization — mức sử dụng CPU**: phần thời gian CPU bận trong khoảng quan sát. Trong mô hình chỉ tính CPU, 14 đơn vị làm việc trên tổng 14 cho 100%; không đồng nghĩa mọi ứng dụng đều phản hồi tốt.
- **Fairness — công bằng**: tiêu chí tránh để một nhóm bị bỏ quên hoặc chia phần theo quy tắc đặt ra. Công bằng có thể là cùng phần CPU hoặc phần theo trọng số; phải nói tiêu chí trước khi đánh giá.

Giảm trung bình không bảo đảm mỗi task tốt hơn. Cần xem cả giá trị riêng lẻ và những task chờ lâu nhất. Định nghĩa và giả định nền đối chiếu với [OSTEP, chương Scheduling của tác giả](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched.pdf).

## 3. Một task đang chạy có bị lấy CPU giữa chừng không?

**Preemption — thu hồi quyền chạy giữa chừng** là việc nhân tạm dừng task còn có thể tiếp tục để cho task khác chạy. Ví dụ P1 còn 5 đơn vị nhưng P2 ngắn hơn vừa đến; thuật toán có thể lấy CPU khỏi P1. **Non-preemptive — không thu hồi giữa chừng** nghĩa là lựa chọn hiện tại kéo dài đến khi task hoàn tất hoặc tự phải chờ; **preemptive — có thu hồi** cho phép đổi trước mốc ấy.

Để đổi task, nhân thực hiện **context switch — chuyển ngữ cảnh**: lưu trạng thái thực thi của task cũ, khôi phục trạng thái task mới rồi tiếp tục. “Ngữ cảnh” gồm những thông tin như vị trí lệnh và các giá trị trong bộ xử lý cần để chạy tiếp. Nó không xóa task cũ và không bắt task cũ tính lại từ đầu.

Trong máy thật, chuyển đổi mất thời gian. **Overhead — chi phí phụ** là thời gian phục vụ việc quản lý thay vì việc ứng dụng muốn làm. Ngoài lưu/khôi phục, dữ liệu thuận tiện cho task trước có thể không hữu ích cho task sau. Không lấy một chi phí cố định trong ví dụ làm thông số của mọi CPU.

Ví dụ tự đặt: **ms — mili giây** bằng 1/1.000 giây; nếu một lát chạy hữu ích dài 2 ms và sau đó luôn đổi task tốn 0,1 ms, phần hữu ích theo chu kỳ là 2/(2+0,1) ≈ 95,24%. Đổi sang lát 0,1 ms với cùng chi phí giả định làm phần hữu ích còn 50%. Đây chỉ là phép tính mô hình để thấy vì sao đổi quá thường xuyên không miễn phí.

## 4. Nếu ai đến trước được chạy trước thì sao? FCFS

**FCFS — First Come, First Served**, đến trước phục vụ trước, lấy task đầu hàng chờ và cho chạy đến hết đoạn CPU hoặc đến lúc phải chờ. Khi nhiều task đến đồng thời, phải đặt quy tắc phân xử. Ta chọn P1 trước P2 trước P3; B lần lượt là 8, 4, 2; A của cả ba bằng 0.

**Gantt chart — biểu đồ các đoạn chạy trên trục thời gian** dưới đây cho biết ai giữ CPU trong từng khoảng. Khoảng `0–8 P1` nghĩa là P1 dùng 8 đơn vị, từ mốc 0 đến trước mốc 8.

```text
0                 8         12    14
|       P1        |    P2    | P3  |
```

P2 đợi cả 8 đơn vị của P1; P3 đợi P1 rồi P2. Ta đọc S=(0,8,12), C=(8,12,14), theo thứ tự P1,P2,P3. Waiting=(0,8,12), trung bình 20/3≈6,67; turnaround=(8,12,14), trung bình 34/3≈11,33; response bằng waiting vì mỗi task chỉ có một đoạn chạy.

**Convoy effect — hiệu ứng đoàn xe** mô tả những task ngắn bị giữ sau task dài, như nhiều xe nhỏ sau một xe đi chậm. FCFS dễ hiểu và không cần đoán độ dài tương lai, nhưng một công việc tính toán dài có thể làm lần chạy đầu của công việc ngắn rất muộn. Tự kiểm chứng bằng cách đổi thứ tự đầu hàng thành P3,P2,P1: tổng việc vẫn là 14 nhưng thời gian chờ đổi mạnh. Không suy ra scheduler Linux mặc định là FCFS từ ví dụ này.

## 5. Chạy việc ngắn trước có tốt hơn không? SJF và SRTF

### 5.1. SJF: lựa chọn khi CPU rảnh

**SJF — Shortest Job First**, việc ngắn nhất trước, chọn task có đoạn CPU nhỏ nhất trong những task **đã đến và sẵn sàng**. Biến thể ở đây không thu hồi giữa chừng. Với ba task cùng đến, lịch là:

```text
0–2 P3 | 2–6 P2 | 6–14 P1
```

S=(6,2,0), C=(14,6,2). Waiting trung bình (6+2+0)/3=8/3≈2,67; turnaround trung bình (14+6+2)/3=22/3≈7,33. So với FCFS, P1 chờ lâu hơn nhưng tổng thời gian chờ của nhóm giảm.

Vì sao điều đó xảy ra? Đặt một việc ngắn trước việc dài chỉ trì hoãn việc dài một chút, còn đặt việc dài trước việc ngắn bắt việc ngắn chờ rất lâu. Khi cả nhóm đã có mặt, biết chính xác độ dài và không thu hồi, SJF tối thiểu hóa waiting trung bình trong mô hình ấy. Khi có task đến muộn, kết luận phải xét lại: task ngắn đến sau vẫn đợi task đang chạy xong.

Hệ thật không biết sẵn đoạn CPU tương lai. Có thể ước lượng từ hành vi trước, nhưng task có thể đổi hành vi. Vì vậy “biết B” là giả định bài toán, không phải khả năng thần kỳ của kernel.

### 5.2. SRTF: xem lại khi việc mới đến

**SRTF — Shortest Remaining Time First**, chọn thời gian còn lại ngắn nhất, là cách có thu hồi: so sánh phần việc còn lại của task đang chạy với việc mới đến. Tài liệu cũng gọi gần tương ứng là STCF, thời gian đến hoàn tất ngắn nhất.

Đổi dữ liệu: P1=(A=0,B=7), P2=(2,4), P3=(4,1). Các bước:

1. Ở 0 chỉ có P1, cho chạy.
2. Ở 2, P1 còn 5; P2 cần 4 nên chọn P2.
3. Ở 4, P2 còn 2; P3 cần 1 nên chọn P3.
4. Ở 5, P3 xong; P2 còn 2 ngắn hơn P1 còn 5 nên chọn P2.
5. Ở 7, P2 xong; chạy phần còn lại của P1 đến 12.

```text
0–2 P1 | 2–4 P2 | 4–5 P3 | 5–7 P2 | 7–12 P1
```

C=(12,7,5), turnaround=(12,5,1), waiting=(5,1,0), response=(0,0,0). P1 phản hồi ngay nhưng vẫn chờ tổng cộng 5; đó là lý do không lấy response thay waiting. Kiểm tra tổng độ dài các đoạn P1 là 2+5=7, P2 là 2+2=4, P3 là 1; không task nào chạy trước A.

Nếu thời gian còn lại bằng nhau, ví dụ task đang chạy còn 2 và task mới cũng cần 2, bài phải nói **tie-break — quy tắc phân xử khi ngang nhau**. Lab bên dưới chọn task đến sớm hơn rồi tên nhỏ hơn. Quy tắc khác có thể đổi response từng task dù cùng thuật toán chính.

## 6. Nếu muốn mọi người sớm có lượt? Round Robin

**Round Robin — quay vòng**, viết RR, cho mỗi task chạy tối đa một **quantum — lát thời gian**, rồi đưa task chưa xong về cuối hàng. Trong mô hình, quantum q=2 nghĩa là mỗi lượt dùng không quá 2 đơn vị. Task xong sớm thì không cố chạy cho đủ q.

Vẫn dùng A=(0,0,0), B=(8,4,2), đầu hàng P1,P2,P3:

```text
0–2 P1 | 2–4 P2 | 4–6 P3 | 6–8 P1 | 8–10 P2 | 10–12 P1 | 12–14 P1
```

Ở 6, P3 xong và rời hàng. Ở 10, P2 xong; chỉ còn P1 nên hai lát cuối liên tiếp đều là P1. Hết quantum không bắt buộc chuyển sang task khác khi không có đối thủ.

| Task | S | C | Response S−A | Turnaround C−A | Waiting C−A−B |
|---|---:|---:|---:|---:|---:|
| P1 | 0 | 14 | 0 | 14 | 6 |
| P2 | 2 | 10 | 2 | 10 | 6 |
| P3 | 4 | 6 | 4 | 6 | 4 |

Response trung bình là 2, waiting là 16/3≈5,33, turnaround là 10. RR cho P2 lượt đầu sớm hơn FCFS, nhưng P3 xong muộn hơn SJF. Bảng chứng minh đánh giá “tốt hơn” phải đi kèm mục tiêu.

q lớn hơn hoặc bằng mọi B trong nhóm cùng đến làm lịch gần FCFS. q nhỏ thường giảm đợi lượt đầu trong mô hình nhưng tăng số lần chuyển đổi có thể cần trên máy thật. Quantum lý thuyết ở đây không phải thông số mặc định của cơ chế lập lịch công bằng Linux.

## 7. Nếu một công việc quan trọng hơn? Priority và nguy cơ bị bỏ quên

**Priority scheduling — lập lịch theo ưu tiên** chọn task sẵn sàng có ưu tiên cao nhất. Phải nói chiều của thang số: trong ví dụ tự đặt này số 1 cao hơn số 3; ở một giao diện Linux khác chiều có thể ngược lại. Có cả biến thể thu hồi và không thu hồi.

Giả sử task L ưu tiên thấp chờ từ t=0. Cứ mỗi đơn vị lại đến một task H ưu tiên cao cần đúng 1 đơn vị. Với lựa chọn luôn phục vụ H, CPU không bao giờ rảnh cho L. **Starvation — bị đói tài nguyên** là tình trạng task có thể chờ không có giới hạn dù vẫn sẵn sàng; khác với task chỉ đang đợi một lần việc dài nhưng cuối cùng có lượt. SJF/SRTF cũng có nguy cơ tương tự khi dòng việc ngắn cứ đến.

**Aging — tăng cơ hội theo tuổi chờ** cải thiện ưu tiên của task đợi lâu. Ví dụ cứ 5 đơn vị đợi thì tăng một bậc, nhưng phải quy định trần ưu tiên và cách phân xử để biết có tránh được starvation trong mô hình hay không. Đổi lại, việc vừa đến nhưng quan trọng có thể đợi task được nâng ưu tiên. Aging là lựa chọn thiết kế, không phải tính năng tự động của mọi policy Linux.

Để tự kiểm chứng, vẽ 10 đơn vị của dòng H: L vẫn không chạy. Sau đó áp quy tắc aging cụ thể và đánh dấu mốc L vượt H hoặc ngang H. Nếu bạn chỉ nói “aging giải quyết” mà không chỉ được mốc có lượt, lập luận còn thiếu.

## 8. Không biết độ dài tương lai thì học từ hành vi được không? MLFQ

**MLFQ — Multi-Level Feedback Queue**, nhiều hàng đợi có phản hồi, chia task thành các mức ưu tiên và thay đổi mức dựa trên cách task đã sử dụng CPU. “Phản hồi” là thông tin hành vi quay lại ảnh hưởng lựa chọn sau: task dùng CPU lâu có thể bị hạ mức; task thường chờ dữ liệu có cơ hội phản hồi sớm.

Một mô hình minh họa, không phải luật Linux mặc định:

```text
Mức cao Q0: q=1  ── dùng hết ngân sách mức ──→ Q1
Mức thấp Q1: q=4  ── chưa xong ─────────────→ cuối Q1
       ↑
       └── mỗi 10 đơn vị: đưa task về Q0 để tránh bị bỏ quên
```

CPU chọn Q0 trước; trong cùng hàng thì quay vòng. Task mới vào Q0. P1 tính toán dài dùng hết ngân sách 1 và bị xuống Q1; P3 ngắn có thể xong ở Q0. Mũi tên nâng định kỳ là **priority boost — đợt nâng ưu tiên**, giúp task thấp có lại cơ hội.

Cần tách **quantum** của một lượt với **allotment — tổng ngân sách được dùng ở một mức**. Nếu task chạy 0,9 rồi chủ động chờ để giữ nguyên mức và bộ đếm bị đặt lại mỗi lần, nó có thể khai thác quy tắc. Thiết kế đếm tổng CPU đã dùng ở mức ấy qua nhiều lượt hạn chế việc này. Tần suất nâng, quy tắc task thức dậy và ngân sách từng mức đều ảnh hưởng lịch; chỉ ghi “dùng MLFQ” chưa đủ để tính đáp án. Đối chiếu thiết kế trong [OSTEP, chương MLFQ](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched-mlfq.pdf).

## 9. Lab: tự kiểm tra lịch thay vì chỉ tin bảng đáp án

### 9.1. Vẽ tay và đối chiếu bằng mô phỏng SRTF

Điều kiện: có Python 3; chương trình sau chỉ tính trong bộ nhớ, không thay scheduler hoặc tạo tải kéo dài. **Shell — trình nhận lệnh**, như Bash, chạy lệnh bạn nhập. Trong Bash, đoạn `python3 - <<'PY'` đưa các dòng đến mốc `PY` cho Python; đây không phải tệp cần có sẵn.

Trước khi chạy, vẽ lịch cho P1=(0,7), P2=(2,4), P3=(4,1), rồi lập bảng S,C,response,turnaround,waiting. Dùng mã để đối chiếu:

```bash
python3 - <<'PY'
jobs = {'P1': (0, 7), 'P2': (2, 4), 'P3': (4, 1)}
remaining = {p: b for p, (a, b) in jobs.items()}
first, finish, spans = {}, {}, []
t = 0
while len(finish) < len(jobs):
    ready = [p for p, (a, b) in jobs.items()
             if a <= t and remaining[p] > 0]
    if not ready:
        t += 1
        continue
    p = min(ready, key=lambda p: (remaining[p], jobs[p][0], p))
    first.setdefault(p, t)
    if spans and spans[-1][2] == p and spans[-1][1] == t:
        spans[-1][1] = t + 1
    else:
        spans.append([t, t + 1, p])
    remaining[p] -= 1
    t += 1
    if remaining[p] == 0:
        finish[p] = t
print('Các đoạn chạy:', spans)
print('Task S C response turnaround waiting')
for p, (a, b) in jobs.items():
    c, s = finish[p], first[p]
    print(p, s, c, s-a, c-a, c-a-b)
PY
```

`ready` chỉ chứa task đến rồi mà chưa xong. `min` chọn phần còn lại nhỏ nhất; nếu bằng thì xét A rồi tên. Mỗi vòng giảm một đơn vị của task được chọn. `spans` ghép các đơn vị liên tiếp của cùng task để dễ đọc.

Kết quả đối chiếu của bộ dữ liệu này:

```text
Các đoạn chạy: [[0, 2, 'P1'], [2, 4, 'P2'], [4, 5, 'P3'], [5, 7, 'P2'], [7, 12, 'P1']]
Task S C response turnaround waiting
P1 0 12 0 12 5
P2 2 7 0 5 1
P3 4 5 0 1 0
```

Tự kiểm tra ba điều: mọi đoạn chạy sau A; tổng CPU của từng task bằng B; waiting không âm. Đổi P2 đến ở 20 để tạo khoảng CPU rảnh: mã không in đoạn rảnh nhưng mốc thời gian vẫn nhảy qua khoảng ấy. Mã giả định A là số nguyên không âm, B là số nguyên dương; không mô phỏng I/O, nhiều CPU hoặc chi phí chuyển đổi. Với B=0, vòng lặp hiện tại không hoàn tất task ấy: cần sửa mô hình hoặc giữ đúng điều kiện dữ liệu.

### 9.2. Tự so sánh các mục tiêu trên cùng dữ liệu

Vẽ lại FCFS, SJF và RR q=2 cho nhóm B=(8,4,2), A=(0,0,0). Đừng chỉ chép ba biểu đồ: cộng đoạn của từng task, tính bảng rồi nhận xét ai chịu thiệt.

Tiêu chí đối chiếu:

- Ba lịch đều xong ở 14 vì không có thời gian rảnh hay chi phí phụ.
- Waiting trung bình lần lượt là 20/3, 8/3 và 16/3.
- Response trung bình lần lượt là 20/3, 8/3 và 2.
- RR ở dữ liệu này có response trung bình thấp nhất trong ba lịch, nhưng SJF có turnaround trung bình thấp nhất.

Đổi q=20: RR cho lịch FCFS theo thứ tự đầu hàng. Sau đó thêm 0,1 đơn vị phí cho mỗi lần **thực sự đổi sang task khác**, tính lại kết thúc; không tự tính hai lát P1 cuối là một lần đổi sang task khác. Đây là mô hình phí tự đặt, không đo kernel.

## 10. Những sai lầm nào khiến phép tính trông đúng mà kết luận sai?

| Sai lầm | Cách phát hiện và sửa |
|---|---|
| Chọn task chưa đến vì B nhỏ nhất | Tại từng mốc liệt kê riêng các task A≤t |
| Lấy C làm turnaround khi A khác 0 | Luôn ghi cột A và tính C−A |
| Lấy lần chờ đầu làm tổng waiting | Với task bị thu hồi, cộng mọi đoạn đợi hoặc dùng công thức đúng phạm vi |
| Dùng waiting=C−A−B khi có I/O | Trừ phần chờ thiết bị, kiểm tra mô hình trạng thái |
| Quên task đã xong trong RR | Xóa khỏi hàng khi remaining=0 |
| Khẳng định q càng nhỏ càng tốt | Thêm phí chuyển đổi và nêu mục tiêu cần tối ưu |
| SJF luôn tối ưu bất kể dữ liệu | Kiểm tra thời điểm đến, khả năng thu hồi, độ dài biết trước và đại lượng cần tối ưu |
| Gọi mọi cơ chế Linux là RR/MLFQ | Phân biệt lý thuyết với policy và cách triển khai của kernel ở bài 19 |

## 11. Tự kiểm tra: bạn có giải thích được một tình huống mới?

1. P1 bắt đầu ngay ở 0 nhưng xong ở 12 sau hai lần bị lấy CPU. Response bằng 0 có chứng minh không chờ không? **Đối chiếu:** không; response chỉ xét lần đầu, waiting còn các lần sau.
2. Task chạy CPU 2, chờ thiết bị 6, chạy CPU 2 rồi xong ở 15, A=0. Tổng chờ CPU là bao nhiêu? **Đối chiếu:** 15−4−6=5, nếu không có trạng thái khác.
3. P1=(0,5), P2=(1,1). So SJF không thu hồi và SRTF. **Đối chiếu:** SJF chạy P1 0–5 rồi P2 5–6; SRTF chạy P1 0–1, P2 1–2, P1 2–6. P2 có response 4 và 0 tương ứng.
4. Vì sao FCFS và Linux `SCHED_FIFO` không thể coi là cùng một quy tắc đầy đủ? **Đối chiếu:** FCFS bài này là một hàng mô hình; `SCHED_FIFO` còn có các mức ưu tiên thời gian thực và thu hồi bởi mức cao hơn.
5. Đề xuất một quy tắc aging cụ thể cho task thấp và chỉ ra khi nào có lượt. **Đối chiếu:** phải nêu chiều ưu tiên, tốc độ nâng, trần và phân xử khi bằng; chỉ nói “tăng dần” chưa đủ.
6. Trong MLFQ, task đổi sang chờ trước hết quantum có chắc luôn ở hàng cao? **Đối chiếu:** phụ thuộc cách đếm ngân sách tích lũy và quy tắc hạ/nâng của mô hình.

**Tự nhắc lại:** scheduler chọn trong task sẵn sàng; thuật toán quyết định ai có lượt; biểu đồ cho S và C; công thức chuyển những mốc ấy thành thước đo. Không có lịch tốt nhất cho mọi mục tiêu. Mỗi kết luận luôn đi cùng giả định về thời điểm đến, I/O, thông tin độ dài và phí chuyển đổi.

## Nguồn đối chiếu

- [OSTEP — Scheduling: Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched.pdf): mô hình và cách so thuật toán cơ bản.
- [OSTEP — Multi-Level Feedback Queue](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched-mlfq.pdf): học từ hành vi, ngân sách mức và nâng định kỳ.
- [Linux man-pages — sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html): ranh giới giữa mô hình và giao diện lập lịch Linux. Cơ chế fair scheduling hiện đại cần xem nguồn kernel ở bài 19, không chỉ đoạn giới thiệu lịch sử trong manual.
