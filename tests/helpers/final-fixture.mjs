// Synthetic test data only. Production content is kept outside the repository.
export function fixture() {
  return {version:1, revision:'synthetic-final-v1', title:'테스트 최종 모의고사',
    scope:Array.from({length:13}, (_,i) => ({id:`topic-${i}`,title:`테스트 항목 ${i+1}`,points:[`테스트 설명 ${i+1}`]})),
    questions:Array.from({length:21}, (_,i) => ({id:`test-${i}`,topic:`topic-${i%13}`,title:`테스트 문항 ${i+1}`,
      prompt:`비공개 테스트 질문 ${i+1}`,answer:`테스트 모범답안 ${i+1}`,rubric:['첫 번째 기준','두 번째 기준'],pitfall:'테스트 주의점',resource:null}))};
}
