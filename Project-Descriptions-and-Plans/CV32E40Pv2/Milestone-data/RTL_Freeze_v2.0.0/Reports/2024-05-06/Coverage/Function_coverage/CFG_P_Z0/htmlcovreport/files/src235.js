var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_Z0/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/cv32e40p_aligner.sv","src":"// Copyright 2018 ETH Zurich and University of Bologna.\n// Copyright and related rights are licensed under the Solderpad Hardware\n// License, Version 0.51 (the \"License\"); you may not use this file except in\n// compliance with the License.  You may obtain a copy of the License at\n// http://solderpad.org/licenses/SHL-0.51. Unless required by applicable law\n// or agreed to in writing, software, hardware and materials distributed under\n// this License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR\n// CONDITIONS OF ANY KIND, either express or implied. See the License for the\n// specific language governing permissions and limitations under the License.\n\n////////////////////////////////////////////////////////////////////////////////\n// Engineer:       Pasquale Davide Schiavone - pschiavo@iis.ee.ethz.ch        //\n//                                                                            //\n// Additional contributions by:                                               //\n//                 Igor Loi - igor.loi@greenwaves-technologies.com            //\n//                                                                            //\n// Design Name:    Instrctuon Aligner                                         //\n// Project Name:   RI5CY                                                      //\n// Language:       SystemVerilog                                              //\n//                                                                            //\n////////////////////////////////////////////////////////////////////////////////\n\nmodule cv32e40p_aligner (\n    input logic clk,\n    input logic rst_n,\n\n    input  logic fetch_valid_i,\n    output logic aligner_ready_o,  //prevents overwriting the fethced instruction\n\n    input logic if_valid_i,\n\n    input  logic [31:0] fetch_rdata_i,\n    output logic [31:0] instr_aligned_o,\n    output logic        instr_valid_o,\n\n    input logic [31:0] branch_addr_i,\n    input logic        branch_i,  // Asserted if we are branching/jumping now\n\n    input logic [31:0] hwlp_addr_i,\n    input logic        hwlp_update_pc_i,\n\n    output logic [31:0] pc_o\n);\n\n  enum logic [2:0] {\n    ALIGNED32,\n    MISALIGNED32,\n    MISALIGNED16,\n    BRANCH_MISALIGNED,\n    WAIT_VALID_BRANCH\n  }\n      state, next_state;\n\n  logic [15:0] r_instr_h;\n  logic [31:0] hwlp_addr_q;\n  logic [31:0] pc_q, pc_n;\n  logic update_state;\n  logic [31:0] pc_plus4, pc_plus2;\n  logic aligner_ready_q, hwlp_update_pc_q;\n\n  assign pc_o     = pc_q;\n\n  assign pc_plus2 = pc_q + 2;\n  assign pc_plus4 = pc_q + 4;\n\n  always_ff @(posedge clk or negedge rst_n) begin : proc_SEQ_FSM\n    if (~rst_n) begin\n      state            <= ALIGNED32;\n      r_instr_h        <= '0;\n      hwlp_addr_q      <= '0;\n      pc_q             <= '0;\n      aligner_ready_q  <= 1'b0;\n      hwlp_update_pc_q <= 1'b0;\n    end else begin\n      if (update_state) begin\n        pc_q             <= pc_n;\n        state            <= next_state;\n        r_instr_h        <= fetch_rdata_i[31:16];\n        aligner_ready_q  <= aligner_ready_o;\n        hwlp_update_pc_q <= 1'b0;\n      end else begin\n        if (hwlp_update_pc_i) begin\n          hwlp_addr_q      <= hwlp_addr_i;  // Save the JUMP target address to keep pc_n up to date during the stall\n          hwlp_update_pc_q <= 1'b1;\n        end\n\n      end\n    end\n  end\n\n  always_comb begin\n\n    //default outputs\n    pc_n            = pc_q;\n    instr_valid_o   = fetch_valid_i;\n    instr_aligned_o = fetch_rdata_i;\n    aligner_ready_o = 1'b1;\n    update_state    = 1'b0;\n    next_state      = state;\n\n\n    case (state)\n      ALIGNED32: begin\n        if (fetch_rdata_i[1:0] == 2'b11) begin\n          /*\n                  Before we fetched a 32bit aligned instruction\n                  Therefore, now the address is aligned too and it is 32bits\n                */\n          next_state      = ALIGNED32;\n          pc_n            = pc_plus4;\n          instr_aligned_o = fetch_rdata_i;\n          //gate id_valid with fetch_valid as the next state should be evaluated only if mem content is valid\n          update_state    = fetch_valid_i & if_valid_i;\n          if (hwlp_update_pc_i || hwlp_update_pc_q)\n            pc_n = hwlp_update_pc_i ? hwlp_addr_i : hwlp_addr_q;\n        end else begin\n          /*\n                  Before we fetched a 32bit aligned instruction\n                  Therefore, now the address is aligned too and it is 16bits\n                */\n          next_state      = MISALIGNED32;\n          pc_n            = pc_plus2;\n          instr_aligned_o = fetch_rdata_i;  //only the first 16b are used\n          //gate id_valid with fetch_valid as the next state should be evaluated only if mem content is valid\n          update_state    = fetch_valid_i & if_valid_i;\n        end\n      end\n\n\n      MISALIGNED32: begin\n        if (r_instr_h[1:0] == 2'b11) begin\n          /*\n                  Before we fetched a 32bit misaligned instruction\n                  So now the beginning of the next instruction is the stored one\n                  The istruction is 32bits so it is misaligned again\n                */\n          next_state      = MISALIGNED32;\n          pc_n            = pc_plus4;\n          instr_aligned_o = {fetch_rdata_i[15:0], r_instr_h[15:0]};\n          //gate id_valid with fetch_valid as the next state should be evaluated only if mem content is valid\n          update_state    = fetch_valid_i & if_valid_i;\n        end else begin\n          /*\n                  Before we fetched a 32bit misaligned instruction\n                  So now the beginning of the next instruction is the stored one\n                  The istruction is 16bits misaligned\n                */\n          instr_aligned_o = {fetch_rdata_i[31:16], r_instr_h[15:0]};  //only the first 16b are used\n          next_state      = MISALIGNED16;\n          instr_valid_o   = 1'b1;\n          pc_n            = pc_plus2;\n          //we cannot overwrite the 32bit instruction just fetched\n          //so tell the IF stage to stall, the coming instruction goes to the FIFO\n          aligner_ready_o = !fetch_valid_i;\n          //not need to gate id_valid with fetch_valid as the next state depends only on r_instr_h\n          update_state    = if_valid_i;\n        end\n      end\n\n\n      MISALIGNED16: begin\n        //this is 1 as we holded the value before with raw_instr_hold_o\n        instr_valid_o = !aligner_ready_q || fetch_valid_i;\n        if (fetch_rdata_i[1:0] == 2'b11) begin\n          /*\n                  Before we fetched a 16bit misaligned instruction\n                  So now the beginning of the next instruction is the new one\n                  The istruction is 32bits so it is aligned\n                */\n          next_state      = ALIGNED32;\n          pc_n            = pc_plus4;\n          instr_aligned_o = fetch_rdata_i;\n          //no gate id_valid with fetch_valid as the next state sdepends only on mem content that has be held the previous cycle with raw_instr_hold_o\n          update_state    = (!aligner_ready_q | fetch_valid_i) & if_valid_i;\n        end else begin\n          /*\n                  Before we fetched a 16bit misaligned  instruction\n                  So now the beginning of the next instruction is the new one\n                  The istruction is 16bit aligned\n                */\n          next_state = MISALIGNED32;\n          pc_n = pc_plus2;\n          instr_aligned_o = fetch_rdata_i;  //only the first 16b are used\n          //no gate id_valid with fetch_valid as the next state sdepends only on mem content that has be held the previous cycle with raw_instr_hold_o\n          update_state = (!aligner_ready_q | fetch_valid_i) & if_valid_i;\n        end\n      end\n\n\n      BRANCH_MISALIGNED: begin\n        //we jumped to a misaligned location, so now we received {TARGET, XXXX}\n        if (fetch_rdata_i[17:16] == 2'b11) begin\n          /*\n                  We jumped to a misaligned location that contains 32bits instruction\n                */\n          next_state      = MISALIGNED32;\n          instr_valid_o   = 1'b0;\n          pc_n            = pc_q;\n          instr_aligned_o = fetch_rdata_i;\n          //gate id_valid with fetch_valid as the next state should be evaluated only if mem content is valid\n          update_state    = fetch_valid_i & if_valid_i;\n        end else begin\n          /*\n                  We jumped to a misaligned location that contains 16bits instruction, as we consumed the whole word, we can preted to start again from ALIGNED32\n                */\n          next_state = ALIGNED32;\n          pc_n = pc_plus2;\n          instr_aligned_o = {\n            fetch_rdata_i[31:16], fetch_rdata_i[31:16]\n          };  //only the first 16b are used\n          //gate id_valid with fetch_valid as the next state should be evaluated only if mem content is valid\n          update_state = fetch_valid_i & if_valid_i;\n        end\n      end\n\n    endcase  // state\n\n\n    // JUMP, BRANCH, SPECIAL JUMP control\n    if (branch_i) begin\n      update_state = 1'b1;\n      pc_n         = branch_addr_i;\n      next_state   = branch_addr_i[1] ? BRANCH_MISALIGNED : ALIGNED32;\n    end\n\n  end\n\n  /*\n  When a branch is taken in EX, if_valid_i is asserted because the BRANCH is resolved also in\n  case of stalls. This is because the branch information is stored in the IF stage (in the prefetcher)\n  when branch_i is asserted. We introduced here an apparently unuseful  special case for\n  the JUMPS for a cleaner and more robust HW: theoretically, we don't need to save the instruction\n  after a taken branch in EX, thus we will not do it.\n*/\n\n  //////////////////////////////////////////////////////////////////////////////\n  // Assertions\n  //////////////////////////////////////////////////////////////////////////////\n\n`ifdef CV32E40P_ASSERT_ON\n\n  // Hardware Loop check\n  property p_hwlp_update_pc;\n    @(posedge clk) disable iff (!rst_n) (1'b1) |-> (!(hwlp_update_pc_i && hwlp_update_pc_q));\n  endproperty\n\n  a_hwlp_update_pc :\n  assert property (p_hwlp_update_pc);\n\n`endif\n\nendmodule\n","lang":"verilog"};
processSrcData(g_data);