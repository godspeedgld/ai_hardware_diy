int pin_a =4 ;
int pin_b =5 ;
int pin_c =19 ;
int pin_d = 21;
int pin_e =22;
int pin_f =15 ;
int pin_g = 2;
int pin_dp = 18;

int pin_array[8] = {pin_a, pin_b, pin_c, pin_d ,pin_e, pin_f,pin_g, pin_dp};      

int number_array[][8] = {
   // a, b, c, d, e, f, g, dp
   {  0, 0, 0, 0 ,0 ,0, 1, 1},  //0
   {  1, 0, 0, 1 ,1 ,1, 1, 1},  //1
   {  0, 0, 1, 0 ,0 ,1, 0, 1},  //2
   {  0, 0, 0, 0 ,1 ,1, 0, 1},  //3
   {  1, 0, 0, 1 ,1 ,0, 0, 1},  //4
   {  0, 1, 0, 0 ,1 ,0, 0, 1},  //5
   {  0, 1, 0, 0 ,0 ,0, 0, 1},  //6
   {  0, 0, 0, 1 ,1 ,1, 1, 1},  //7
   {  0, 0, 0, 0 ,0 ,0, 0, 1},  //8
   {  0, 0, 0, 0 ,1 ,0, 0, 1},  //9
};

void draw_num(int num){
   for (int i=0; i<8; i++){
    digitalWrite(pin_array[i],number_array[num][i]);

  }
}

void setup() {
  
  // put your setup code here, to run once:
   for (int i=0; i<8; i++){
     pinMode (pin_array[i], OUTPUT);
    digitalWrite (pin_array[i], HIGH);   
   }
 } 

void loop() {
  // put your main code here, to run repeatedly:
  for( int i = 0; i < 8; i++){
    draw_num(i);
    delay(500);
  }
  
 

}
