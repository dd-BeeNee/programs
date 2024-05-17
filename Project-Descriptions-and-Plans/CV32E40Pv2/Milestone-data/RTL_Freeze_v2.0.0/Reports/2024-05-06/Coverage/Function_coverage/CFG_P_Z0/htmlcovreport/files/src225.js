var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_Z0/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/cv32e40p_top.sv","src":"// Copyright 2024 Dolphin Design\n// SPDX-License-Identifier: Apache-2.0 WITH SHL-2.1\n//\n// Licensed under the Solderpad Hardware License v 2.1 (the \"License\");\n// you may not use this file except in compliance with the License, or,\n// at your option, the Apache License version 2.0.\n// You may obtain a copy of the License at\n//\n// https://solderpad.org/licenses/SHL-2.1/\n//\n// Unless required by applicable law or agreed to in writing, any work\n// distributed under the License is distributed on an \"AS IS\" BASIS,\n// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n// See the License for the specific language governing permissions and\n// limitations under the License.\n\n/////////////////////////////////////////////////////////////////////////////\n//                                                                         //\n// Contributors: Pascal Gouedo, Dolphin Design <pascal.gouedo@dolphin.fr>  //\n//                                                                         //\n// Description:  Top level module of CV32E40P instantiating the Core and   //\n//               an optional CVFPU with its clock gating cell.             //\n//                                                                         //\n/////////////////////////////////////////////////////////////////////////////\n\nmodule cv32e40p_top #(\n    parameter COREV_PULP = 0, // PULP ISA Extension (incl. custom CSRs and hardware loop, excl. cv.elw)\n    parameter COREV_CLUSTER = 0,  // PULP Cluster interface (incl. cv.elw)\n    parameter FPU = 0,  // Floating Point Unit (interfaced via APU interface)\n    parameter FPU_ADDMUL_LAT = 0,  // Floating-Point ADDition/MULtiplication computing lane pipeline registers number\n    parameter FPU_OTHERS_LAT = 0,  // Floating-Point COMParison/CONVersion computing lanes pipeline registers number\n    parameter ZFINX = 0,  // Float-in-General Purpose registers\n    parameter NUM_MHPMCOUNTERS = 1\n) (\n    // Clock and Reset\n    input logic clk_i,\n    input logic rst_ni,\n\n    input logic pulp_clock_en_i,  // PULP clock enable (only used if COREV_CLUSTER = 1)\n    input logic scan_cg_en_i,  // Enable all clock gates for testing\n\n    // Core ID, Cluster ID, debug mode halt address and boot address are considered more or less static\n    input logic [31:0] boot_addr_i,\n    input logic [31:0] mtvec_addr_i,\n    input logic [31:0] dm_halt_addr_i,\n    input logic [31:0] hart_id_i,\n    input logic [31:0] dm_exception_addr_i,\n\n    // Instruction memory interface\n    output logic        instr_req_o,\n    input  logic        instr_gnt_i,\n    input  logic        instr_rvalid_i,\n    output logic [31:0] instr_addr_o,\n    input  logic [31:0] instr_rdata_i,\n\n    // Data memory interface\n    output logic        data_req_o,\n    input  logic        data_gnt_i,\n    input  logic        data_rvalid_i,\n    output logic        data_we_o,\n    output logic [ 3:0] data_be_o,\n    output logic [31:0] data_addr_o,\n    output logic [31:0] data_wdata_o,\n    input  logic [31:0] data_rdata_i,\n\n    // Interrupt inputs\n    input  logic [31:0] irq_i,  // CLINT interrupts + CLINT extension interrupts\n    output logic        irq_ack_o,\n    output logic [ 4:0] irq_id_o,\n\n    // Debug Interface\n    input  logic debug_req_i,\n    output logic debug_havereset_o,\n    output logic debug_running_o,\n    output logic debug_halted_o,\n\n    // CPU Control Signals\n    input  logic fetch_enable_i,\n    output logic core_sleep_o\n);\n\n  import cv32e40p_apu_core_pkg::*;\n\n  // Core to FPU\n  logic                              apu_busy;\n  logic                              apu_req;\n  logic [   APU_NARGS_CPU-1:0][31:0] apu_operands;\n  logic [     APU_WOP_CPU-1:0]       apu_op;\n  logic [APU_NDSFLAGS_CPU-1:0]       apu_flags;\n\n  // FPU to Core\n  logic                              apu_gnt;\n  logic                              apu_rvalid;\n  logic [                31:0]       apu_rdata;\n  logic [APU_NUSFLAGS_CPU-1:0]       apu_rflags;\n\n  logic apu_clk_en, apu_clk;\n\n  // Instantiate the Core\n  cv32e40p_core #(\n      .COREV_PULP      (COREV_PULP),\n      .COREV_CLUSTER   (COREV_CLUSTER),\n      .FPU             (FPU),\n      .FPU_ADDMUL_LAT  (FPU_ADDMUL_LAT),\n      .FPU_OTHERS_LAT  (FPU_OTHERS_LAT),\n      .ZFINX           (ZFINX),\n      .NUM_MHPMCOUNTERS(NUM_MHPMCOUNTERS)\n  ) core_i (\n      .clk_i (clk_i),\n      .rst_ni(rst_ni),\n\n      .pulp_clock_en_i(pulp_clock_en_i),\n      .scan_cg_en_i   (scan_cg_en_i),\n\n      .boot_addr_i        (boot_addr_i),\n      .mtvec_addr_i       (mtvec_addr_i),\n      .dm_halt_addr_i     (dm_halt_addr_i),\n      .hart_id_i          (hart_id_i),\n      .dm_exception_addr_i(dm_exception_addr_i),\n\n      .instr_req_o   (instr_req_o),\n      .instr_gnt_i   (instr_gnt_i),\n      .instr_rvalid_i(instr_rvalid_i),\n      .instr_addr_o  (instr_addr_o),\n      .instr_rdata_i (instr_rdata_i),\n\n      .data_req_o   (data_req_o),\n      .data_gnt_i   (data_gnt_i),\n      .data_rvalid_i(data_rvalid_i),\n      .data_we_o    (data_we_o),\n      .data_be_o    (data_be_o),\n      .data_addr_o  (data_addr_o),\n      .data_wdata_o (data_wdata_o),\n      .data_rdata_i (data_rdata_i),\n\n      .apu_busy_o    (apu_busy),\n      .apu_req_o     (apu_req),\n      .apu_gnt_i     (apu_gnt),\n      .apu_operands_o(apu_operands),\n      .apu_op_o      (apu_op),\n      .apu_flags_o   (apu_flags),\n      .apu_rvalid_i  (apu_rvalid),\n      .apu_result_i  (apu_rdata),\n      .apu_flags_i   (apu_rflags),\n\n      .irq_i    (irq_i),\n      .irq_ack_o(irq_ack_o),\n      .irq_id_o (irq_id_o),\n\n      .debug_req_i      (debug_req_i),\n      .debug_havereset_o(debug_havereset_o),\n      .debug_running_o  (debug_running_o),\n      .debug_halted_o   (debug_halted_o),\n\n      .fetch_enable_i(fetch_enable_i),\n      .core_sleep_o  (core_sleep_o)\n  );\n\n  generate\n    if (FPU) begin : fpu_gen\n\n      assign apu_clk_en = apu_req | apu_busy;\n\n      // FPU clock gate\n      cv32e40p_clock_gate core_clock_gate_i (\n          .clk_i       (clk_i),\n          .en_i        (apu_clk_en),\n          .scan_cg_en_i(scan_cg_en_i),\n          .clk_o       (apu_clk)\n      );\n\n      // Instantiate the FPU wrapper\n      cv32e40p_fp_wrapper #(\n          .FPU_ADDMUL_LAT(FPU_ADDMUL_LAT),\n          .FPU_OTHERS_LAT(FPU_OTHERS_LAT)\n      ) fp_wrapper_i (\n          .clk_i         (apu_clk),\n          .rst_ni        (rst_ni),\n          .apu_req_i     (apu_req),\n          .apu_gnt_o     (apu_gnt),\n          .apu_operands_i(apu_operands),\n          .apu_op_i      (apu_op),\n          .apu_flags_i   (apu_flags),\n          .apu_rvalid_o  (apu_rvalid),\n          .apu_rdata_o   (apu_rdata),\n          .apu_rflags_o  (apu_rflags)\n      );\n    end else begin : no_fpu_gen\n      // Drive FPU output signals to 0\n      assign apu_gnt    = '0;\n      assign apu_rvalid = '0;\n      assign apu_rdata  = '0;\n      assign apu_rflags = '0;\n    end\n  endgenerate\n\nendmodule\n","lang":"verilog"};
processSrcData(g_data);