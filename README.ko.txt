기능

* 타이머, 스톱워치 및 전환을 손쉽게 통합할 수 있는 직관적인 플로우 카드,
* 사전 구성 없이 플로우 카드에서 직접 타이머, 스톱워치 및 전환 생성 가능,
* 밀리초(소수 초), 초, 분, 시간 또는 일 단위로 타이머 시작,
* 미리 정해진 종료 시간 없이 스톱워치 시작 가능,
* 시간이 지나면서 기기 매개변수를 점진적으로 변경하는 전환 시작 가능,
* 밀리초(소수 초) 정밀도로 정확한 타이머나 스톱워치 지속 시간에 플로우 트리거 가능,
* 설정 내에서 또는 액션 카드로 타이머, 스톱워치 및 전환 일시 중지 및 재개 가능,
* 간단한 수학 표현식을 사용해 무작위 또는 계산된 지속 시간 또는 조정 지원,
* 모든 타이머, 스톱워치 및 전환은 Homey 재시작 시에도 지속됨,
* 지원되는 카드에서 와일드카드를 사용해 여러 타이머, 스톱워치 및 전환을 동시에 대상으로 지정 가능.

간단한 수학 표현식

시작, 재개 및 조정 액션 카드에는 간단한 수학 표현식이 내장되어 있습니다. 이를 통해 무작위 또는 계산된 타이머 및 스톱워치 지속 시간을 토큰 값 기반 계산을 포함하여 설정할 수 있습니다.

예제:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

기본 수학 표현식 외에도 다음 함수들이 지원됩니다:

* abs(x) - 숫자의 절대값을 계산,
* ceil(x) - 숫자를 다음 정수로 올림,
* floor(x) - 숫자를 이전 정수로 내림,
* round(x) - 숫자를 가장 가까운 정수로 반올림,
* random(min, max) - min보다 크거나 같고 max보다 작은 무작위 숫자,
* min(x, y) - 제공된 목록에서 가장 낮은 숫자,
* max(x, y) - 제공된 목록에서 가장 큰 숫자,
* pick(x, y[, n]) - 제공된 목록에서 무작위 값 선택.

HomeyScript

이용 가능한 플로우 카드 외에도 [HomeyScript](https://homeyscript.homey.app)를 사용하여 타이머와 스톱워치를 제어할 수 있습니다.

예를 들어, 다음 스크립트는 실행 중인 모든 타이머를 중지시킬 것입니다:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - 모든 활성 타이머 목록 검색,
* GET /timers/:id - 단일 타이머 검색,
* PUT /timers/:id - 타이머 일시 중지 또는 재개,
* DELETE /timers/:id - 타이머 중지.
* GET /stopwatches - 모든 활성 타이머 목록 검색,
* GET /stopwatches/:id - 단일 타이머 검색,
* PUT /stopwatches/:id - 타이머 일시 중지 또는 재개,
* DELETE /stopwatches/:id - 타이머 중지.
* GET /transitions - 모든 활성 전환 목록 검색,
* GET /transitions/:id - 단일 전환 검색,
* PUT /transitions/:id - 전환 일시 중지 또는 재개,
* DELETE /transitions/:id - 전환 중지.