# Bài 04 — Linux và RTOS: đúng kết quả, đúng thời điểm

[Mục lục](../README.md) · [← Bài 03](03-kien-truc-linux.md) · [Bài 05 →](05-cai-dat-va-lab.md)

## Mục tiêu và liên hệ

Từ kiến trúc bài 03, hiểu vì sao mục tiêu thiết kế hệ điều hành ảnh hưởng thời gian đáp ứng. Đây là nền tảng cho bài 18–20; chưa cần chạy task ưu tiên real-time.

Sau bài này, bạn cần xác định được sự kiện bắt đầu, đầu ra phải đúng hạn và deadline của **từng công việc**; vẽ đường đi từ sự kiện tới đầu ra; lập ngân sách thời gian; giải thích cách chọn Linux, RTOS, bare metal hoặc tách vòng điều khiển sang MCU. Ta dùng xuyên suốt một bộ điều khiển đọc cảm biến, tính toán rồi cập nhật đầu ra. Mọi con số trong ví dụ dưới đây đều là **giả định để học cách lập luận**, không phải thông số của thiết bị thật.

## 1. Real-time nghĩa là gì?

Một hệ thống real-time cần kết quả đúng trong giới hạn thời gian đã xác định. Deadline là mốc hoàn thành, latency là thời gian đáp ứng, jitter là độ biến thiên thời gian. Giá trị trung bình tốt không nói được tình huống xấu nhất.

Trước khi dùng các từ ấy, phải xác định **đo từ đâu tới đâu**. Ví dụ: cảm biến báo có mẫu mới là sự kiện bắt đầu; đầu ra vật lý đã cập nhật là điểm kết thúc; deadline 1 ms nghĩa là khoảng từ đầu tới cuối không được quá 1 ms theo yêu cầu giả định. Nếu chỉ đo từ lúc thread được đánh thức đến lúc nó được CPU chạy, ta mới đo *wake-up latency*, chưa đo toàn vòng điều khiển. Jitter cũng cần ghi rõ là dao động của chu kỳ, thời điểm bắt đầu hay thời gian đáp ứng. **Throughput** là lượng việc xử lý trong một khoảng thời gian; throughput cao không chứng minh từng việc đúng hạn.

Giả sử 999 vòng hoàn thành sau 200 µs, một vòng sau 1,5 ms. Trung bình vẫn gần 200 µs, nhưng nếu deadline là 1 ms thì vòng cuối đã trễ. Real-time không có nghĩa là “nhanh nhất có thể”; một hệ luôn hoàn thành sau 5 ms có thể phù hợp deadline 10 ms hơn một hệ đa số hoàn thành sau 0,1 ms nhưng đôi khi mất 20 ms.

- **Hard real-time:** vi phạm deadline là không chấp nhận được theo yêu cầu hệ thống, như một số vòng điều khiển an toàn.
- **Firm real-time:** kết quả đến muộn không còn giá trị; có thể cho phép một tỷ lệ bỏ lỡ xác định.
- **Soft real-time:** đến muộn làm giảm chất lượng, như giật âm thanh hoặc hình ảnh.

Phân loại thuộc yêu cầu cụ thể, không tự động thuộc tên sản phẩm. Một thiết bị có thể đồng thời có task hard real-time và giao diện không real-time.

Hãy phân loại theo **hậu quả của việc trễ**. Với hard real-time, một lần trễ vi phạm yêu cầu đã đặt; mức độ nghiêm trọng thực tế phải được xác định từ phân tích hệ thống, không suy từ tên “động cơ” hay “y tế”. Với firm real-time, mẫu quá cũ có thể bị bỏ vì không còn ích; yêu cầu có thể cho phép một tỷ lệ bỏ lỡ. Với soft real-time, kết quả muộn vẫn có thể dùng nhưng trải nghiệm giảm. Cách tự kiểm tra: viết một câu “Nếu đầu ra đến muộn thì…”, rồi mới gán loại cho task. Cùng thiết bị có thể chứa cả ba loại.

### Từ sự kiện đến kết quả có những đoạn nào?

**Task/thread** là đơn vị công việc được scheduler (bộ lập lịch) chọn chạy. **Interrupt (ngắt)** là tín hiệu báo một sự kiện cần xử lý. Task *runnable* đã sẵn sàng nhưng có thể còn chờ CPU; task *blocked* đang đợi điều kiện như khóa, dữ liệu hoặc I/O. Ưu tiên CPU cao không khiến task blocked tự chạy được.

```text
Cảm biến có mẫu mới
  → thiết bị/bus báo interrupt
  → interrupt handler ghi nhận, đánh thức task
  → scheduler cho task chạy
  → task đọc dữ liệu, có thể chờ khóa hoặc I/O
  → task tính lệnh điều khiển
  → driver/bus chuyển lệnh đến cơ cấu chấp hành
  → đầu ra vật lý thực sự thay đổi
```

Đọc từ trên xuống: mỗi mũi tên là một đoạn có thể tiêu tốn thời gian. Mốc cuối phải là điều yêu cầu quan tâm. Nếu yêu cầu là chân điều khiển đổi trạng thái, hàm ghi dữ liệu trả về chưa chắc chứng minh chân đã đổi: lệnh có thể còn trong hàng đợi của driver hoặc trên bus. Sơ đồ là mô hình khái niệm; đường đi thật phụ thuộc thiết bị, driver và cách đo.

```text
T_toàn_tuyến = T_phát_hiện + T_chờ_CPU + T_chờ_khóa/I/O
             + T_tính_toán + T_gửi_lệnh/thiết_bị + T_dự_phòng
```

Muốn dùng tổng này để kiểm tra deadline, từng thành phần cần giới hạn phù hợp với điều kiện làm việc, không thay bằng thời gian trung bình. Nếu một đoạn chưa có giới hạn đáng tin cậy, tổng cũng chưa được chứng minh. Đó là lý do phải hỏi “task đang chờ ở đâu?” thay vì chỉ tăng ưu tiên scheduler.

## 2. Vì sao hệ điều hành thông dụng có jitter?

Task có thể đợi CPU, page fault, khóa, I/O, interrupt hoặc hoạt động firmware. Cache và quản lý điện năng làm thời gian thực thi thay đổi. Scheduler ưu tiên cao chỉ xử lý một phần đường đi; nếu task chờ thiết bị không có giới hạn đáp ứng, ưu tiên CPU không giải quyết được.

Ví dụ một task ưu tiên cao cần mutex (khóa chỉ cho một task dùng tài nguyên tại một thời điểm) mà task ưu tiên thấp đang giữ. Task cao phải chờ; nếu task trung bình liên tục lấy CPU của task thấp, task thấp càng chậm nhả khóa. Đây là **priority inversion**. *Priority inheritance* có thể tạm nâng ưu tiên của chủ khóa để nó nhả khóa sớm hơn, nhưng không sửa được đoạn giữ khóa quá dài hoặc deadlock. [Tài liệu Zephyr về mutex](https://docs.zephyrproject.org/latest/kernel/services/synchronization/mutexes.html) mô tả cơ chế này trong một RTOS cụ thể. Tương tự, page fault, thiết bị chậm, bus, firmware hoặc hypervisor có thể gây trễ ở ngoài phần scheduler kiểm soát; xem [tài liệu kernel về phần cứng real-time](https://docs.kernel.org/core-api/real-time/hardware.html).

Linux cung cấp hệ sinh thái và tính năng phong phú. RTOS thường tập trung tài nguyên nhỏ và đường thực thi có thể phân tích, nhưng vẫn cần thiết kế task, kiểm soát thời gian giữ khóa và đo trên phần cứng đích. MMU không phải ranh giới định nghĩa Linux/RTOS; tồn tại nhiều cấu hình phần cứng và hệ thống khác nhau.

**Linux** là kernel mục đích chung với user space, filesystem, mạng và nhiều driver. **RTOS** (real-time operating system) là hệ điều hành hướng tới việc tổ chức task, interrupt, timer và đồng bộ theo yêu cầu thời gian. **Bare metal** là chương trình chạy trực tiếp trên phần cứng, không dùng scheduler của hệ điều hành; ứng dụng tự tổ chức vòng lặp và interrupt. **MMU** là bộ quản lý bộ nhớ của CPU; có hay không có MMU không tự định nghĩa hệ nào là RTOS. RTOS cũng không phải một thuật toán duy nhất: [Zephyr có cả thread cooperative và preemptive](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html); một thread cooperative chạy lâu vẫn có thể trì hoãn việc khác.

| Yêu cầu | Hướng cân nhắc |
|---|---|
| API web, nhiều ứng dụng, cập nhật từ xa | Linux thường thuận tiện |
| MCU nhỏ, vòng điều khiển với deadline rõ | RTOS hoặc bare metal tùy độ phức tạp |
| UI phong phú kèm vòng điều khiển chặt | Có thể tách Linux và MCU/RTOS |
| Ứng dụng cần jitter thấp trên Linux | Đánh giá kernel, PREEMPT_RT, driver và phần cứng |

Đọc bảng như các **hướng cần đánh giá**, không phải lựa chọn tự động. Bare metal có thể hợp với một vòng lặp rất nhỏ, nhưng khi có nhiều task phải tự giải quyết ưu tiên và tài nguyên dùng chung. Linux thuận tiện cho UI, mạng, lưu trữ và cập nhật; đổi lại phải kiểm chứng độ trễ theo yêu cầu cụ thể. Nếu dùng Linux + MCU/RTOS, chỉ tách được deadline ngắn khỏi Linux khi MCU tự hoàn thành vòng cảm biến → đầu ra. Nếu MCU phải hỏi Linux mỗi chu kỳ, thời gian giao tiếp và xử lý Linux vẫn nằm trong ngân sách deadline.

### PREEMPT_RT giúp ở đâu?

**Preemption** là khả năng tạm dừng việc đang chạy để chuyển CPU cho việc ưu tiên hơn. [Tài liệu PREEMPT_RT của kernel](https://docs.kernel.org/core-api/real-time/theory.html) mô tả việc làm nhiều đường kernel có thể preempt, thay đổi cơ chế khóa theo hướng hỗ trợ priority inheritance và đưa nhiều interrupt handler vào thread để scheduler quản lý. Điều đó giảm một số nguồn trễ từ lúc task ưu tiên cao trở thành runnable đến khi nó chạy. Vẫn còn đoạn xử lý cấp thấp không thể preempt; I/O, firmware, driver, thuật toán và phần cứng đích cũng phải được xem xét. Vì vậy PREEMPT_RT không tự chứng nhận toàn hệ là hard real-time. Bài 20 sẽ đi sâu vào các chính sách và phép đo.

## 3. Lab tư duy: lập ngân sách thời gian

Giả sử vòng điều khiển có deadline 1 ms. Đọc cảm biến mất tối đa 150 µs, tính toán 250 µs, xuất lệnh 100 µs. Còn 500 µs cho chờ lập lịch, interrupt, khóa và dự phòng. Nếu một I/O có thể chờ 2 ms, ngân sách đã thất bại dù tính toán rất nhanh.

Phép tính là `1000 − (150 + 250 + 100) = 500 µs`. Để kết luận đạt, ba con số trên phải thực sự là giới hạn dưới điều kiện đã nêu và bốn phần còn lại cũng phải có giới hạn. Nếu “150 µs” chỉ là số lớn nhất *đã quan sát*, ta chưa thể gọi nó là giới hạn tuyệt đối. Ví dụ này chưa tính rõ thời gian thiết bị nhận và áp dụng lệnh; nếu yêu cầu kết thúc ở đầu ra vật lý, phải cộng đoạn ấy. Một phép đo phần chờ CPU lớn nhất 80 µs trong buổi thử nghiệm chỉ cho phép viết “lớn nhất quan sát: 80 µs”, không cho phép viết “luôn ≤ 80 µs”.

Lập bảng cho ba hệ thống: web server, máy phát âm thanh và điều khiển động cơ. Với mỗi hệ, ghi deadline, hậu quả trễ, dữ liệu cần đo, và phần việc có thể tách sang bộ xử lý khác. Không tự đặt con số sản phẩm thực; dùng giả định và ghi rõ chúng.

| Công việc | Sự kiện → đầu ra cần đúng hạn | Hậu quả trễ cần xác định | Những đoạn cần đo |
|---|---|---|---|
| Web server | Nhận yêu cầu → gửi xong phản hồi | Người dùng chờ, timeout hoặc vi phạm mức dịch vụ | Hàng đợi, CPU, storage, mạng |
| Phát âm thanh | Cần nạp buffer → dữ liệu sẵn trước khi buffer cạn | Dropout/giật | Đánh thức, xử lý, driver và đường âm thanh |
| Điều khiển động cơ | Có mẫu cảm biến → đầu ra được cập nhật | Tùy yêu cầu điều khiển và an toàn | Interrupt, chờ CPU/khóa, tính toán, bus và đầu ra |

Bảng gợi ý **điểm đầu và điểm cuối**, không cung cấp deadline thật. Với từng hàng: (1) tự đặt một deadline **giả định**, (2) vẽ đường dữ liệu, (3) điền giới hạn giả định từng đoạn và đánh dấu “chưa biết” nơi thiếu dữ liệu, (4) cộng ngân sách, (5) viết kết luận “đạt dưới giả định / không đạt / chưa đủ dữ liệu”. Đừng thay đoạn “chưa biết” bằng 0.

Giả sử phép đo một đoạn cho trung vị 100 µs, p99 300 µs và giá trị lớn nhất 1,2 ms, trong khi deadline toàn tuyến là 1 ms. **Đây là số minh họa, không phải kết quả đã chạy.** Trung vị mô tả mốc giữa mẫu, p99 mô tả mốc khoảng 99% mẫu đo không vượt qua, còn 1,2 ms là lần chậm nhất đã thấy. Nếu đoạn này bắt buộc nằm trên đường hoàn thành, mẫu 1,2 ms đã đủ bác bỏ cấu hình thử nghiệm đó. Ngược lại, p99 thấp hoặc không thấy lần trễ nào **không** chứng minh mọi lần tương lai đều đúng hạn.

Khi đo thật, phải ghi phần cứng, phiên bản/cấu hình kernel hoặc RTOS, tải nền, loại I/O, số mẫu, thời lượng và chính xác điểm bắt đầu/kết thúc. Đo wake-up latency chỉ kiểm tra một đoạn, không thay thế đo đầu ra cuối. Đo trong VM hữu ích để học cách đọc số nhưng hypervisor/host thêm nguồn trễ; không dùng kết quả VM để chứng nhận phần cứng đích. [Tài liệu kernel về ảo hóa](https://docs.kernel.org/core-api/real-time/hardware.html) giải thích giới hạn này.

## 4. Mẹo và lỗi thường gặp

- WCET là thời gian thực thi tệ nhất dưới giả định đã nêu; giá trị lớn nhất đo được chưa chứng minh là WCET tuyệt đối.
- Đo latency trong VM hữu ích để học, nhưng hypervisor có thể tạo jitter không do guest quyết định.
- RTOS không tự bảo đảm deadline của ứng dụng sai thiết kế. PREEMPT_RT cũng không biến mọi tổ hợp phần cứng/phần mềm thành hệ hard real-time đã được chứng minh.
- CPU đang rảnh không chứng minh task sẽ không trễ: task có thể chờ khóa, I/O hoặc firmware. Kiểm tra toàn đường đi.
- Gọi hàm ghi lệnh thành công không nhất thiết nghĩa là cơ cấu chấp hành đã cập nhật; chọn điểm đo đúng với yêu cầu.
- Tách việc sang MCU nhưng vẫn đợi Linux mỗi chu kỳ không loại Linux khỏi deadline. Vẽ lại sơ đồ dữ liệu sau khi tách.

## 5. Tự kiểm tra

1. Throughput cao có chứng minh real-time không? **Không, cần xét deadline và phân bố thời gian.**
2. Task ưu tiên cao chờ mutex do task thấp giữ có thể bị trễ không? **Có; bài 20 sẽ học priority inversion.**
3. Đo một triệu lần không trễ có chứng minh không bao giờ trễ? **Không; cần xem phạm vi thử nghiệm và lập luận giới hạn.**
4. Wake-up latency thấp có chứng minh đầu ra thiết bị đúng hạn không? **Không; còn đọc dữ liệu, tính toán, khóa, driver, bus và thiết bị.**
5. Một đoạn I/O mất tới 2 ms trong đường bắt buộc của deadline 1 ms. Tăng ưu tiên task có đủ không? **Không; phải đổi đường I/O, kiến trúc hoặc yêu cầu.**
6. MCU tự chạy vòng điều khiển nhưng Linux chỉ gửi cấu hình định kỳ chậm hơn. Deadline ngắn còn phụ thuộc Linux không? **Có thể không, nếu MCU thực sự hoàn thành vòng độc lập và cơ chế cập nhật cấu hình không chặn vòng; phải kiểm tra thiết kế cụ thể.**

## Tổng kết mô hình tư duy

```text
Yêu cầu của từng task → mốc bắt đầu, đầu ra, deadline
                     → vẽ toàn bộ đường đi và ngân sách từng đoạn
                     → chọn kiến trúc, scheduler, phần cứng
                     → đo/kiểm chứng trên hệ đích dưới điều kiện đã nêu
```

Sơ đồ đọc từ trái sang phải: yêu cầu quyết định phải đo gì; đường đi cho biết thời gian có thể mất ở đâu; kiến trúc được chọn để đáp ứng ngân sách; kiểm chứng trên hệ đích cho biết kết luận áp dụng trong phạm vi nào. **Real-time là đúng hạn theo yêu cầu cụ thể**, không phải nhãn tự động bảo đảm của Linux, RTOS hay MCU.

## Đọc thêm

- [Zephyr — scheduling](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html): trạng thái task, ưu tiên, cooperative và preemptive.
- [Zephyr — mutexes](https://docs.zephyrproject.org/latest/kernel/services/synchronization/mutexes.html): chờ khóa và priority inheritance.
- [Linux kernel — PREEMPT_RT theory](https://docs.kernel.org/core-api/real-time/theory.html): preemption, khóa và threaded interrupts.
- [Linux kernel — considering hardware](https://docs.kernel.org/core-api/real-time/hardware.html): bus, firmware và ảo hóa trong phân tích độ trễ.
