import {describe,expect,it} from 'vitest';
import {fuelFillColor} from './fuelFill';
describe('fuel fill colours',()=>{
 it('changes at each documented whole-percent boundary',()=>{
  expect([0,10,19,20,26,50,51,100].map(fuelFillColor)).toEqual(['#e65151','#e65151','#e65151','#e3cf41','#e3cf41','#e3cf41','#39d879','#39d879']);
 });
});
