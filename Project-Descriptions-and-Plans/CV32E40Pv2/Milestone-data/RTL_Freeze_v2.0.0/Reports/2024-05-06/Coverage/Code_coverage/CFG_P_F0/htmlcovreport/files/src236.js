var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_F0/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/cv32e40p_obi_interface.sv","src":"// Copyright 2020 Silicon Labs, Inc.\n//\n// This file, and derivatives thereof are licensed under the\n// Solderpad License, Version 2.0 (the \"License\").\n//\n// Use of this file means you agree to the terms and conditions\n// of the license and are in full compliance with the License.\n//\n// You may obtain a copy of the License at:\n//\n//     https://solderpad.org/licenses/SHL-2.0/\n//\n// Unless required by applicable law or agreed to in writing, software\n// and hardware implementations thereof distributed under the License\n// is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS\n// OF ANY KIND, EITHER EXPRESSED OR IMPLIED.\n//\n// See the License for the specific language governing permissions and\n// limitations under the License.\n\n////////////////////////////////////////////////////////////////////////////////\n// Engineer:       Arjan Bink - arjan.bink@silabs.com                         //\n//                                                                            //\n// Design Name:    OBI (Open Bus Interface)                                   //\n// Project Name:   CV32E40P                                                   //\n// Language:       SystemVerilog                                              //\n//                                                                            //\n// Description:    Open Bus Interface adapter. Translates transaction request //\n//                 on the trans_* interface into an OBI A channel transfer.   //\n//                 The OBI R channel transfer translated (i.e. passed on) as  //\n//                 a transaction response on the resp_* interface.            //\n//                                                                            //\n//                 This adapter does not limit the number of outstanding      //\n//                 OBI transactions in any way.                               //\n//                                                                            //\n////////////////////////////////////////////////////////////////////////////////\n\nmodule cv32e40p_obi_interface #(\n    parameter TRANS_STABLE =  0                   // Are trans_addr_i, trans_we_i, trans_be_i, trans_wdata_i, trans_atop_i signals stable during a non-accepted transaction?\n) (\n    input logic clk,\n    input logic rst_n,\n\n    // Transaction request interface\n    input logic trans_valid_i,\n    output logic trans_ready_o,\n    input logic [31:0] trans_addr_i,\n    input logic trans_we_i,\n    input logic [3:0] trans_be_i,\n    input logic [31:0] trans_wdata_i,\n    input  logic  [5:0] trans_atop_i,             // Future proof addition (not part of OBI 1.0 spec; not used in CV32E40P)\n\n    // Transaction response interface\n    output logic resp_valid_o,  // Note: Consumer is assumed to be 'ready' whenever resp_valid_o = 1\n    output logic [31:0] resp_rdata_o,\n    output logic resp_err_o,\n\n    // OBI interface\n    output logic        obi_req_o,\n    input  logic        obi_gnt_i,\n    output logic [31:0] obi_addr_o,\n    output logic        obi_we_o,\n    output logic [ 3:0] obi_be_o,\n    output logic [31:0] obi_wdata_o,\n    output logic [ 5:0] obi_atop_o,\n    input  logic [31:0] obi_rdata_i,\n    input  logic        obi_rvalid_i,\n    input  logic        obi_err_i\n);\n\n  enum logic {\n    TRANSPARENT,\n    REGISTERED\n  }\n      state_q, next_state;\n\n  //////////////////////////////////////////////////////////////////////////////\n  // OBI R Channel\n  //////////////////////////////////////////////////////////////////////////////\n\n  // The OBI R channel signals are passed on directly on the transaction response\n  // interface (resp_*). It is assumed that the consumer of the transaction response\n  // is always receptive when resp_valid_o = 1 (otherwise a response would get dropped)\n\n  assign resp_valid_o = obi_rvalid_i;\n  assign resp_rdata_o = obi_rdata_i;\n  assign resp_err_o   = obi_err_i;\n\n\n  //////////////////////////////////////////////////////////////////////////////\n  // OBI A Channel\n  //////////////////////////////////////////////////////////////////////////////\n\n  generate\n    if (TRANS_STABLE) begin : gen_trans_stable\n\n      // If the incoming transaction itself is stable, then it satisfies the OBI protocol\n      // and signals can be passed to/from OBI directly.\n      assign obi_req_o     = trans_valid_i;\n      assign obi_addr_o    = trans_addr_i;\n      assign obi_we_o      = trans_we_i;\n      assign obi_be_o      = trans_be_i;\n      assign obi_wdata_o   = trans_wdata_i;\n      assign obi_atop_o    = trans_atop_i;\n\n      assign trans_ready_o = obi_gnt_i;\n\n      // FSM not used\n      assign state_q       = TRANSPARENT;\n      assign next_state    = TRANSPARENT;\n    end else begin : gen_no_trans_stable\n\n      // OBI A channel registers (to keep A channel stable)\n      logic [31:0] obi_addr_q;\n      logic        obi_we_q;\n      logic [ 3:0] obi_be_q;\n      logic [31:0] obi_wdata_q;\n      logic [ 5:0] obi_atop_q;\n\n      // If the incoming transaction itself is not stable; use an FSM to make sure that\n      // the OBI address phase signals are kept stable during non-granted requests.\n\n      //////////////////////////////////////////////////////////////////////////////\n      // OBI FSM\n      //////////////////////////////////////////////////////////////////////////////\n\n      // FSM (state_q, next_state) to control OBI A channel signals.\n\n      always_comb begin\n        next_state = state_q;\n\n        case (state_q)\n\n          // Default (transparent) state. Transaction requests are passed directly onto the OBI A channel.\n          TRANSPARENT: begin\n            if (obi_req_o && !obi_gnt_i) begin\n              // OBI request not immediately granted. Move to REGISTERED state such that OBI address phase\n              // signals can be kept stable while the transaction request (trans_*) can possibly change.\n              next_state = REGISTERED;\n            end\n          end  // case: TRANSPARENT\n\n          // Registered state. OBI address phase signals are kept stable (driven from registers).\n          REGISTERED: begin\n            if (obi_gnt_i) begin\n              // Received grant. Move back to TRANSPARENT state such that next transaction request can be passed on.\n              next_state = TRANSPARENT;\n            end\n          end  // case: REGISTERED\n\n        endcase\n      end\n\n      always_comb begin\n        if (state_q == TRANSPARENT) begin\n          obi_req_o   = trans_valid_i;  // Do not limit number of outstanding transactions\n          obi_addr_o  = trans_addr_i;\n          obi_we_o    = trans_we_i;\n          obi_be_o    = trans_be_i;\n          obi_wdata_o = trans_wdata_i;\n          obi_atop_o  = trans_atop_i;\n        end else begin\n          // state_q == REGISTERED\n          obi_req_o   = 1'b1;  // Never retract request\n          obi_addr_o  = obi_addr_q;\n          obi_we_o    = obi_we_q;\n          obi_be_o    = obi_be_q;\n          obi_wdata_o = obi_wdata_q;\n          obi_atop_o  = obi_atop_q;\n        end\n      end\n\n      //////////////////////////////////////////////////////////////////////////////\n      // Registers\n      //////////////////////////////////////////////////////////////////////////////\n\n      always_ff @(posedge clk, negedge rst_n) begin\n        if (rst_n == 1'b0) begin\n          state_q     <= TRANSPARENT;\n          obi_addr_q  <= 32'b0;\n          obi_we_q    <= 1'b0;\n          obi_be_q    <= 4'b0;\n          obi_wdata_q <= 32'b0;\n          obi_atop_q  <= 6'b0;\n        end else begin\n          state_q <= next_state;\n          if ((state_q == TRANSPARENT) && (next_state == REGISTERED)) begin\n            // Keep OBI A channel signals stable throughout REGISTERED state\n            obi_addr_q  <= obi_addr_o;\n            obi_we_q    <= obi_we_o;\n            obi_be_q    <= obi_be_o;\n            obi_wdata_q <= obi_wdata_o;\n            obi_atop_q  <= obi_atop_o;\n          end\n        end\n      end\n\n      // Always ready to accept a new transfer requests when previous A channel\n      // transfer has been granted. Note that cv32e40p_obi_interface does not limit\n      // the number of outstanding transactions in any way.\n      assign trans_ready_o = (state_q == TRANSPARENT);\n\n    end\n  endgenerate\n\nendmodule  // cv32e40p_obi_interface\n","lang":"verilog"};
processSrcData(g_data);